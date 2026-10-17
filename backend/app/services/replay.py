import json
import logging
from datetime import datetime

from .. import repositories as repo
from ..config import FIXTURES_DIR
from ..repositories.records import DemoState
from . import timeline
from .storm_replay_v2 import scenario_file

log = logging.getLogger("groundwork.replay")

MISSING_SOURCE_WARNING = "fixtures/storm_replay.json not added yet; replay has no real event source attached"


def _scenario_source(scenario_id: str = "demo-storm") -> str | None:
    path = FIXTURES_DIR / scenario_file(scenario_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8")).get("source")


def get_replay() -> DemoState:
    return repo.demo_state.get()


def warnings(state: DemoState) -> list[str]:
    return [MISSING_SOURCE_WARNING] if state.replay_active and state.replay_source is None else []


def start_replay(scenario_id: str, now: datetime) -> DemoState:
    """Idempotent: repeating the same request leaves state (and the acknowledged alarm) unchanged."""
    state = repo.demo_state.get()
    if state.replay_active and state.replay_scenario_id == scenario_id:
        return state
    state = repo.demo_state.update(
        replay_active=True,
        replay_scenario_id=scenario_id,
        replay_source=_scenario_source(scenario_id),
        replay_started_at=now,
        acknowledged_at=None,  # a new STOP_WORK re-arms the beacon alarm
    )
    timeline.record("replay_started", f"Storm replay '{scenario_id}' started", now, ref_id=scenario_id)
    log.info("replay started", extra={"scenario_id": scenario_id})
    return state


def stop_replay(now: datetime) -> DemoState:
    """Idempotent: stopping an inactive replay is a no-op."""
    state = repo.demo_state.get()
    if not state.replay_active:
        return state
    state = repo.demo_state.update(
        replay_active=False, replay_scenario_id=None, replay_source=None, replay_started_at=None, acknowledged_at=None,
    )
    timeline.record("replay_stopped", "Storm replay stopped; live/cached state restored", now)
    log.info("replay stopped")
    return state
