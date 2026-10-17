import json
import logging
from dataclasses import dataclass
from datetime import datetime

from .. import repositories as repo
from ..config import FIXTURES_DIR
from ..repositories.records import DemoState
from . import timeline
from .storm_replay_v2 import SCENARIO_FILES, archived_alerts, scenario_file, scenario_source

log = logging.getLogger("groundwork.replay")

MISSING_SOURCE_WARNING = "fixtures/storm_replay.json not added yet; replay has no real event source attached"


def _scenario_source(scenario_id: str = "demo-storm") -> str | None:
    if not (FIXTURES_DIR / scenario_file(scenario_id)).exists():
        return None
    return scenario_source(scenario_id)


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    event: str
    source: str | None
    reference_url: str | None
    onset: str | None
    expires: str | None
    area: str | None


def _event_summary(archived: dict | None, data: dict) -> str:
    """Distinct NWS event names for the day, warnings first; falls back to the fixture's simulated alert."""
    names = sorted({e["event"] for e in (archived or {}).get("events", {}).values()},
                   key=lambda n: ("Warning" not in n, "Watch" not in n, n))
    if not names:
        return data.get("simulated_alert") or "No NWS alerts that day"
    shown = ", ".join(names[:3])
    return shown + (f" and {len(names) - 3} more" if len(names) > 3 else "")


def list_scenarios() -> list[Scenario]:
    """Replay scenarios that have a fixture file, for the frontend's scenario picker."""
    scenarios = []
    for scenario_id, filename in SCENARIO_FILES.items():
        path = FIXTURES_DIR / filename
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        archived = archived_alerts(scenario_id)
        source = scenario_source(scenario_id)
        window = (archived or {}).get("window_utc") or [None, None]
        alert_source = (archived or {}).get("source", {})
        state = alert_source.get("state")
        scenarios.append(Scenario(
            id=scenario_id,
            # Fixture label if present, else the first clause of the source line ("Hurricane Milton, 2024-10-09").
            title=data.get("label") or (source or scenario_id).split(". ")[0],
            event=_event_summary(archived, data),
            source=source,
            reference_url=alert_source.get("url"),
            onset=window[0],
            expires=window[1],
            area=f"{len(data.get('sites', {}))} sites" + (f" in {state}" if state else ""),
        ))
    return scenarios


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
