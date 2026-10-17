"""Per-site status: weather safety and per-vehicle ground access, kept as separate decisions."""
from dataclasses import dataclass, replace
from datetime import datetime

from .. import repositories as repo
from ..config import DEMO_DEVICE_ID, DEMO_SITE_ID
from . import light, site_insights
from .access import demo_tray_access
from .display import fresh_reading
from .hazard import assess
from .sites import WEATHER_FIELDS, Site, load_sites, require_site
from .weather import details_for, load_snapshot, observations_for

VEHICLES = ("pickup", "heavy_truck")
NO_REPLAY_DATA = "REPLAY: this scenario has no archived data for this site, so its weather is UNKNOWN"


@dataclass(frozen=True)
class SiteStatus:
    site: Site
    hazard_score: float | None
    weather_state: str
    access_call: dict[str, str]
    effective_status: dict[str, str]
    data_status: str
    observations: tuple[dict, ...]
    missing_fields: tuple[str, ...]
    mode: str
    evaluated_at: datetime
    hazard_explanation: tuple[str, ...] = ()
    alert_events: tuple[str, ...] = ()
    hazard_subscores: dict | None = None
    alerts: tuple[dict, ...] = ()
    advisories: tuple[str, ...] = ()  # informational notes (e.g. low light); never change a status
    reasons: dict | None = None
    priority_rank: int | None = None  # set by list_statuses / get_status across all sites


from .storm_replay_v2 import replay_inputs, replay_site_v2

ACCESS_RANK = {"NO_GO_FOR_REVIEW": 0, "MATS_FOR_REVIEW": 1, "UNKNOWN": 2, "GO_FOR_REVIEW": 3}


def priority_key(s: SiteStatus) -> tuple:
    """Shared by the site list and the 6 PM briefing. Critical alerts first, then hazard score,
    then access restriction, then missing data."""
    return (
        s.weather_state != "STOP_WORK",
        -(s.hazard_score or 0),
        min(ACCESS_RANK[a] for a in s.access_call.values()),
        -len(s.missing_fields),
    )


def evaluate_status(site: Site, now: datetime) -> SiteStatus:
    state = repo.demo_state.get()
    is_demo = site.id == DEMO_SITE_ID

    observations, stale = ([], False) if is_demo else observations_for(site.id, now)
    values = {o["variable"]: o["value"] for o in observations}
    have = {k for k, v in values.items() if v is not None}

    reading = fresh_reading(DEMO_DEVICE_ID, now) if is_demo else None
    moisture = reading.moisture_index if reading else None

    assessed = None
    details = None if is_demo else details_for(site.id)
    if is_demo:
        access = {v: demo_tray_access(moisture, v) for v in VEHICLES}
    else:
        # events=None (no snapshot details, or the NWS call failed) means weather cannot be declared safe.
        assessed = assess(values, details["alerts"] if details else None)
        access = dict(assessed.access_call)

    hazard_score = None
    replay_info = None
    if state.replay_active:
        mode = "replay"
        replay_info = None if is_demo else replay_site_v2(site.id, state.replay_scenario_id)
        if is_demo:
            weather_state = "STOP_WORK"  # the tray always plays the storm in the demo (README 14.4)
        elif replay_info:
            hazard_score = replay_info["hazard_score"]
            weather_state = replay_info["weather_state"] or "UNKNOWN"
        else:
            # The scenario has no data for this site: never invent a storm here, never call it safe,
            # and never show live data inside a replay.
            weather_state = "UNKNOWN"
            replay_info = {"explanation": (NO_REPLAY_DATA,), "alert_events": ()}
    elif is_demo:
        # The tray has no live weather feed; it runs a calm-weather demo scenario.
        weather_state, mode = "NORMAL", "sensor_demo"
    else:
        weather_state, hazard_score = assessed.weather_state, assessed.hazard_score
        mode = "cached" if load_snapshot() else "simulated"

    effective = {}
    for v in VEHICLES:
        if weather_state in ("STOP_WORK", "UNKNOWN"):
            effective[v] = weather_state
        elif is_demo and state.crew_flag_at is not None:
            effective[v] = "SUPERVISOR_REVIEW"
        elif weather_state == "CAUTION" and access[v] == "GO_FOR_REVIEW":
            effective[v] = "SUPERVISOR_REVIEW"  # caution weather never reads as a plain GO
        else:
            effective[v] = access[v]

    missing = () if is_demo else tuple(f for f in WEATHER_FIELDS if f not in have)
    if is_demo and reading is None:
        missing = ("demo_tray_moisture",)

    # Sub-scores, alert details and reasons come from the same inputs that decided weather_state.
    sub, alerts, reasons = None, (), None
    if not is_demo:
        if state.replay_active:
            inputs = replay_inputs(site.id, state.replay_scenario_id)
            used_values, events = (inputs["values"], inputs["events"]) if inputs else (None, None)
            alerts = tuple(inputs["alerts"]) if inputs else ()
        else:
            used_values, events = values, (details["alerts"] if details else None)
            alerts = tuple(site_insights.live_alerts(events, site.latitude, site.longitude))
        if used_values is not None:
            sub = site_insights.subscores(used_values, events)
            reasons = {"weather_triggers": site_insights.weather_triggers(used_values, events),
                       "soil_drainage": details.get("drainage") if details else None,
                       "vehicle_class": None}  # access is per vehicle; the client knows which one is selected

    if is_demo:
        data_status = "sensor_demo"
    elif not observations:
        data_status = "not_fetched"
    else:
        data_status = "stale" if stale else "available"

    return SiteStatus(
        site=site,
        hazard_score=hazard_score,
        weather_state=weather_state,
        access_call=access,
        effective_status=effective,
        data_status=data_status,
        observations=tuple(observations),
        missing_fields=missing,
        mode=mode,
        evaluated_at=now,
        hazard_explanation=(replay_info["explanation"] if state.replay_active and replay_info
                            else assessed.explanation if assessed else ()),
        alert_events=(replay_info["alert_events"] if state.replay_active and replay_info
                      else assessed.alert_events if assessed else ()),
        hazard_subscores=sub,
        alerts=alerts,
        reasons=reasons,
        advisories=light.advisories(reading) if is_demo else (),
    )


def list_statuses(now: datetime, weather_state: str | None = None) -> list[SiteStatus]:
    """All sites in their usual order, each tagged with its rank across ALL sites (1 = most urgent)."""
    statuses = [evaluate_status(s, now) for s in load_sites()]
    ranks = {id(s): i for i, s in enumerate(sorted(statuses, key=priority_key), start=1)}
    statuses = [replace(s, priority_rank=ranks[id(s)]) for s in statuses]
    if weather_state is not None:
        statuses = [s for s in statuses if s.weather_state == weather_state]
    return statuses


def get_status(site_id: str, now: datetime) -> SiteStatus:
    require_site(site_id)  # 404 before ranking every site
    return next(s for s in list_statuses(now) if s.site.id == site_id)


def portfolio_mode() -> str:
    if repo.demo_state.get().replay_active:
        return "replay"
    return "cached" if load_snapshot() else "simulated"
