from fastapi import APIRouter

from .. import repositories as repo
from ..config import API_VERSION, FIXTURES_DIR
from ..schemas.common import Envelope
from ..schemas.responses import HealthOut
from ..services.sites import load_sites
from ..services.weather import load_snapshot
from .responses import ok

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
