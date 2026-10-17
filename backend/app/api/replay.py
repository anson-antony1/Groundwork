import json

from fastapi import APIRouter

from ..config import FIXTURES_DIR
from ..envelope import envelope, now_utc
from ..schemas import ReplayStart
from ..state import store

router = APIRouter(prefix="/replay", tags=["replay"])


def _load_scenario(scenario_id: str) -> tuple[dict, list[str]]:
    path = FIXTURES_DIR / "storm_replay.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8")), []
    return (
        {"scenario_id": scenario_id, "source": None, "event_window": None},
        ["fixtures/storm_replay.json not added yet; replay has no real event source attached"],
    )


@router.post("/start")
def start_replay(body: ReplayStart | None = None):
    scenario_id = (body or ReplayStart()).scenario_id
    scenario, errors = _load_scenario(scenario_id)
    now = now_utc()
    store.replay_active = True
    store.replay_scenario = scenario
    store.acknowledged_at = None  # a new STOP_WORK re-arms the beacon alarm
    store.log("replay_start", None, {"scenario_id": scenario_id}, now)
    return envelope({"replay_active": True, "scenario": scenario}, "replay", errors=errors)


@router.post("/stop")
def stop_replay():
    now = now_utc()
    store.replay_active = False
    store.replay_scenario = None
    store.acknowledged_at = None
    store.log("replay_stop", None, {}, now)
    return envelope({"replay_active": False}, "simulated")
