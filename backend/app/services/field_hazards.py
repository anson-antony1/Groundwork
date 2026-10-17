"""Field hazards from Sperry's PlanIT Control brief, layered on top of the weather decision.

Lightning: lightning reported within 10 miles of a site in the last 30 minutes forces STOP_WORK until
30 minutes after the newest strike, so each new strike restarts the all-clear countdown. There is no
licensed strike network here, so strikes come from crew reports (category lightning_observed, counted
unless a supervisor rejected them) and the alert says so. NWS thunderstorm warnings still force
STOP_WORK on their own (hazard.py). A report has no GPS fix, so a strike sits at the reporting site.

Wildfire and wildlife come from fixtures/hazards_snapshot.json (scripts/fetch_hazards_v1.py): NIFC
active wildfire incidents and iNaturalist American alligator sightings. An active wildfire within
10 miles raises NORMAL to CAUTION; wildlife sightings are explanation notes and never change a status.

All thresholds are demo policy. Nothing here applies during a storm replay, which shows only
historical data.
"""
import json
import math
from dataclasses import dataclass, replace
from datetime import datetime, timedelta

from .. import repositories as repo
from ..config import FIXTURES_DIR
from .sites import load_sites

LIGHTNING_RADIUS_MI = 10.0
ALL_CLEAR = timedelta(minutes=30)
WILDFIRE_CAUTION_MI = 10.0
HAZARDS_PATH = FIXTURES_DIR / "hazards_snapshot.json"
HAZARDS_STALE_AFTER = timedelta(hours=12)


def distance_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.radians
    a = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(a))


@dataclass(frozen=True)
class Strike:
    latitude: float
    longitude: float
    at: datetime
    site_id: str
    report_id: str
    confirmed: bool


@dataclass(frozen=True)
class Lightning:
    newest_at: datetime
    all_clear_at: datetime
    distance_mi: float  # to the newest strike
    strikes: int
    confirmed: bool


_strike_cache: tuple[datetime, list] | None = None


def recent_strikes(now: datetime) -> list[Strike]:
    """Crew-reported lightning from the last 30 minutes, newest first; rejected reports never count.
    Cached per `now`, so ranking all sites in one request reads the reports once."""
    global _strike_cache
    if _strike_cache is not None and _strike_cache[0] == now:
        return _strike_cache[1]
    coords = {s.id: (s.latitude, s.longitude) for s in load_sites()}
    out = [Strike(*coords[r.site_id], r.reported_at, r.site_id, r.id, r.verification == "confirmed")
           for r in repo.reports.list()
           if r.category_user == "lightning_observed" and r.verification != "rejected"
           and r.site_id in coords and now - ALL_CLEAR < r.reported_at <= now]
    out.sort(key=lambda s: s.at, reverse=True)
    _strike_cache = (now, out)
    return out


def lightning_at(latitude: float, longitude: float, now: datetime,
                 strikes: list[Strike] | None = None) -> Lightning | None:
    near = [(s, distance_mi(latitude, longitude, s.latitude, s.longitude))
            for s in (recent_strikes(now) if strikes is None else strikes)]
    near = [(s, d) for s, d in near if d <= LIGHTNING_RADIUS_MI]
    if not near:
        return None
    newest, dist = max(near, key=lambda sd: sd[0].at)
    return Lightning(newest.at, newest.at + ALL_CLEAR, dist, len(near), any(s.confirmed for s, _ in near))


def countdown(lightning: Lightning, now: datetime) -> str:
    """mm:ss until all clear, rounded up so it never shows 00:00 while still stopped."""
    left = max(0, math.ceil((lightning.all_clear_at - now).total_seconds()))
    return f"{left // 60:02d}:{left % 60:02d}"


def rearm_if_tray_affected(site_id: str, category: str) -> None:
    """A new strike near the demo tray re-arms the beacon alarm, like a new storm does."""
    if category != "lightning_observed":
        return
    sites = {s.id: s for s in load_sites()}
    from ..config import DEMO_SITE_ID
    tray, at = sites.get(DEMO_SITE_ID), sites.get(site_id)
    if tray and at and distance_mi(tray.latitude, tray.longitude, at.latitude, at.longitude) <= LIGHTNING_RADIUS_MI:
        repo.demo_state.update(acknowledged_at=None)


_hazards_cache: tuple[float, dict] | None = None


def load_hazards() -> dict | None:
    """fixtures/hazards_snapshot.json, re-read only when the file changes."""
    global _hazards_cache
    if not HAZARDS_PATH.exists():
        return None
    mtime = HAZARDS_PATH.stat().st_mtime
    if _hazards_cache is None or _hazards_cache[0] != mtime:
        _hazards_cache = (mtime, json.loads(HAZARDS_PATH.read_text(encoding="utf-8")))
    return _hazards_cache[1]


def _observation(variable: str, value, unit: str, source: str, fetched_at: str, stale: bool, url: str) -> dict:
    quality = "missing" if value is None else ("stale" if stale else "available")
    return {"variable": variable, "value": value, "unit": unit, "source": source, "kind": "observed",
            "valid_at": fetched_at[:10], "fetched_at": fetched_at, "quality": quality, "reference_url": url}


def _hhmm(t: datetime) -> str:
    return t.strftime("%H:%M UTC")


def apply(status, now: datetime):
    """Returns the SiteStatus with lightning, wildfire and wildlife folded in (unchanged in a replay)."""
    if repo.demo_state.get().replay_active:
        return status
    site = status.site
    weather_state = status.weather_state
    effective = dict(status.effective_status)
    explanation, events, alerts = list(status.hazard_explanation), list(status.alert_events), list(status.alerts)
    observations = list(status.observations)

    bolt = lightning_at(site.latitude, site.longitude, now)
    if bolt:
        weather_state = "STOP_WORK"
        effective = {v: "STOP_WORK" for v in effective}
        who = "confirmed crew report" if bolt.confirmed else "crew report, unverified"
        events.append("Lightning within 10 mi")
        alerts.append({"event": "Lightning within 10 mi", "source": f"Crew lightning report ({who})",
                       "severity": "Severe", "onset": bolt.newest_at, "expires": bolt.all_clear_at,
                       "reference_url": None})
        explanation.append(
            f"Lightning: {bolt.strikes} crew-reported strike(s) within 10 mi, newest {bolt.distance_mi:.1f} mi away at "
            f"{_hhmm(bolt.newest_at)}. STOP WORK until {_hhmm(bolt.all_clear_at)} (all clear in {countdown(bolt, now)}); "
            "each new strike restarts the 30-minute countdown. Source: crew reports, not a strike-detection network.")

    hazards = load_hazards()
    entry = (hazards or {}).get("sites", {}).get(site.id)
    if entry is not None:
        fetched = hazards["fetched_at"]
        stale = now - datetime.fromisoformat(fetched) > HAZARDS_STALE_AFTER
        fire, wild = entry.get("wildfire") or {}, entry.get("wildlife") or {}
        observations.append(_observation("active_wildfires_25mi", fire.get("count"), "incidents within 25 mi",
                                         "NIFC WFIGS active wildfire incidents", fetched, stale,
                                         hazards.get("wildfire_reference")))
        observations.append(_observation("alligator_sightings_30d", wild.get("count"), "sightings within 10 km, 30 days",
                                         "iNaturalist community observations (unverified)", fetched, stale,
                                         hazards.get("wildlife_reference")))
        nearest = fire.get("nearest_mi")
        if nearest is not None and nearest <= WILDFIRE_CAUTION_MI and not stale:
            if weather_state == "NORMAL":
                weather_state = "CAUTION"
                effective = {v: "SUPERVISOR_REVIEW" if a == "GO_FOR_REVIEW" else a for v, a in effective.items()}
            events.append("Active wildfire within 10 mi")
            alerts.append({"event": "Active wildfire within 10 mi",
                           "source": f"NIFC WFIGS: {fire.get('nearest_name') or 'active incident'}, {nearest:.1f} mi",
                           "severity": "Moderate", "onset": None, "expires": None,
                           "reference_url": hazards.get("wildfire_reference")})
            explanation.append(f"Wildfire: {fire.get('nearest_name') or 'an active incident'} is {nearest:.1f} mi away "
                               f"(NIFC, fetched {fetched[:16]}Z). Demo policy: an active fire within 10 mi raises CAUTION.")
        if wild.get("count"):  # a note, never a status change (advisories stay reserved for the demo tray)
            explanation.append(f"Wildlife: {wild['count']} American alligator sighting(s) within 10 km in the last "
                               "30 days (iNaturalist community observations, unverified). Brief the crew.")

    # One ML number per site: the learned STOP-WORK forecast (forecast_model.py, shown in its own panel) when it
    # has a prediction; otherwise the NOAA storm-report model's line. Both are advisory.
    if status.forecast_model is None:
        from . import ml_index
        ml = ml_index.explain(status)
        if ml:
            explanation.append(ml)

    return replace(status, weather_state=weather_state, effective_status=effective,
                   hazard_explanation=tuple(explanation), alert_events=tuple(events), alerts=tuple(alerts),
                   observations=tuple(observations))
