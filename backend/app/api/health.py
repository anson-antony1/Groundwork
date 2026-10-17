from datetime import datetime

from fastapi import APIRouter

from .. import config
from .. import repositories as repo
from ..config import API_VERSION, DEMO_SITE_ID, FIXTURES_DIR
from ..core.clock import now_utc
from ..schemas.common import Envelope
from ..schemas.responses import CoverageOut, HealthOut, SourceFreshnessOut
from ..services.sites import WEATHER_FIELDS, load_sites
from ..services.weather import STALE_AFTER, load_snapshot
from .responses import ok

WEATHER_VARS = ("rain_7d", "rain_forecast", "gust_forecast", "apparent_temp", "nws_alerts")

router = APIRouter(tags=["health"])

FIXTURES = ("sites_50.json", "weather_snapshot.json", "storm_replay.json", "sensor_replay.csv", "display_states.json")


@router.get("/health", response_model=Envelope[HealthOut], summary="Service and data-source status")
def get_health():
    snap = load_snapshot()
    details = (snap or {}).get("details") or {}
    nws_ok = any(d.get("alerts") is not None for d in details.values())
    usda_ok = any(d.get("drainage") is not None for d in details.values())
    replay_active = repo.demo_state.get().replay_active
    data = HealthOut(
        status="ok",
        version=API_VERSION,
        storage="sqlite",
        auth="auth0" if config.AUTH_ENABLED else "disabled",
        sites_loaded=len(load_sites()),
        replay_active=replay_active,
        fixtures={name: (FIXTURES_DIR / name).exists() for name in FIXTURES},
        connectors={
            "open_meteo": "ok" if (FIXTURES_DIR / "weather_snapshot.json").exists() else "not_built",
            "usda_nrcs": "ok" if usda_ok else "not_built",
            "nws": "ok" if nws_ok else "not_built",
        },
    )
    return ok(data, "replay" if replay_active else "live")


@router.get("/coverage", response_model=Envelope[CoverageOut],
            summary="Data coverage and freshness for the field sites (README section 15 validation metrics)")
def get_coverage():
    now = now_utc()
    snap_sites = (load_snapshot() or {}).get("sites", {})
    field_sites = [s.id for s in load_sites() if s.id != DEMO_SITE_ID]
    with_weather = with_soil = with_both = with_missing = 0
    fetched: dict[str, list[datetime]] = {}
    for site_id in field_sites:
        values = {o["variable"]: o["value"] for o in snap_sites.get(site_id, [])}
        weather = all(values.get(v) is not None for v in WEATHER_VARS)
        soil = values.get("usda_soil") is not None
        with_weather += weather
        with_soil += soil
        with_both += weather and soil
        with_missing += any(values.get(f) is None for f in WEATHER_FIELDS)
        for o in snap_sites.get(site_id, []):
            if o.get("fetched_at"):
                fetched.setdefault(o["source"], []).append(datetime.fromisoformat(o["fetched_at"]))
    freshness = []
    for source, times in sorted(fetched.items()):
        times.sort()
        freshness.append(SourceFreshnessOut(
            source=source, observations=len(times), oldest_fetched_at=times[0],
            median_fetched_at=times[len(times) // 2], newest_fetched_at=times[-1],
            stale=now - times[0] > STALE_AFTER,
        ))
    data = CoverageOut(
        total_sites=len(field_sites), sites_with_usda_soil=with_soil, sites_with_weather=with_weather,
        sites_with_both=with_both, sites_with_missing=with_missing,
        stale_after_hours=STALE_AFTER.total_seconds() / 3600, freshness=freshness,
    )
    return ok(data, "cached" if snap_sites else "simulated",
              missing_fields=[] if snap_sites else ["weather_snapshot"])
