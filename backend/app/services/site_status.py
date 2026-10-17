"""Per-site status: weather safety and per-vehicle ground access, kept as separate decisions."""
from dataclasses import dataclass
from datetime import datetime

from .. import repositories as repo
from ..config import DEMO_DEVICE_ID, DEMO_SITE_ID
from .access import demo_tray_access
from .display import fresh_reading
from .sites import WEATHER_FIELDS, Site, load_sites, require_site
from .weather import load_snapshot, observations_for

VEHICLES = ("pickup", "heavy_truck")


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


def evaluate_status(site: Site, now: datetime) -> SiteStatus:
    state = repo.demo_state.get()
    is_demo = site.id == DEMO_SITE_ID

    if state.replay_active:
        weather_state, mode = "STOP_WORK", "replay"
    elif is_demo:
        # The tray has no live weather feed; it runs a calm-weather demo scenario.
        weather_state, mode = "NORMAL", "sensor_demo"
    else:
        # No NWS alerts connector yet, so weather can't be declared safe: UNKNOWN, never NORMAL.
        weather_state, mode = "UNKNOWN", "cached" if load_snapshot() else "simulated"

    observations, stale = ([], False) if is_demo else observations_for(site.id, now)
    have = {o["variable"] for o in observations if o["value"] is not None}

    reading = fresh_reading(DEMO_DEVICE_ID, now) if is_demo else None
    moisture = reading.moisture_index if reading else None
    access = {v: demo_tray_access(moisture, v) if is_demo else "UNKNOWN" for v in VEHICLES}

    effective = {}
    for v in VEHICLES:
        if weather_state in ("STOP_WORK", "UNKNOWN"):
            effective[v] = weather_state
        elif is_demo and state.crew_flag_at is not None:
            effective[v] = "SUPERVISOR_REVIEW"
        else:
            effective[v] = access[v]

    missing = () if is_demo else tuple(f for f in WEATHER_FIELDS if f not in have)
    if is_demo and reading is None:
        missing = ("demo_tray_moisture",)

    if is_demo:
        data_status = "sensor_demo"
    elif not observations:
        data_status = "not_fetched"
    else:
        data_status = "stale" if stale else "available"

    return SiteStatus(
        site=site,
        hazard_score=None,
        weather_state=weather_state,
        access_call=access,
        effective_status=effective,
        data_status=data_status,
        observations=tuple(observations),
        missing_fields=missing,
        mode=mode,
        evaluated_at=now,
    )


def list_statuses(now: datetime, weather_state: str | None = None) -> list[SiteStatus]:
    statuses = [evaluate_status(s, now) for s in load_sites()]
    if weather_state is not None:
        statuses = [s for s in statuses if s.weather_state == weather_state]
    return statuses


def get_status(site_id: str, now: datetime) -> SiteStatus:
    return evaluate_status(require_site(site_id), now)


def portfolio_mode() -> str:
    if repo.demo_state.get().replay_active:
        return "replay"
    return "cached" if load_snapshot() else "simulated"
