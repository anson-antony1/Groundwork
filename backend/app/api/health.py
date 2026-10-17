from fastapi import APIRouter

from .. import repositories as repo
from ..config import API_VERSION, FIXTURES_DIR
from ..schemas.common import Envelope
from ..schemas.responses import HealthOut
from ..services.sites import load_sites
from .responses import ok

router = APIRouter(tags=["health"])

FIXTURES = ("sites_50.json", "weather_snapshot.json", "storm_replay.json", "sensor_replay.csv", "display_states.json")


@router.get("/health", response_model=Envelope[HealthOut], summary="Service and data-source status")
def get_health():
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
            "usda_nrcs": "not_built",
            "nws": "not_built",
        },
    )
    return ok(data, "replay" if replay_active else "live")
