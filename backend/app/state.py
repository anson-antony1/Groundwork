"""In-memory state for the scaffold. Replace with SQLite (app/db) once the schema settles.

Everything here resets when uvicorn restarts, including on --reload.
"""
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime

HISTORY_LIMIT = 5000


def _history() -> defaultdict:
    return defaultdict(lambda: deque(maxlen=HISTORY_LIMIT))


@dataclass
class Store:
    readings: dict[str, deque] = field(default_factory=_history)
    device_events: list[dict] = field(default_factory=list)
    reports: list[dict] = field(default_factory=list)
    timeline: list[dict] = field(default_factory=list)
    briefings: list[dict] = field(default_factory=list)
    replay_active: bool = False
    replay_scenario: dict | None = None
    acknowledged_at: datetime | None = None
    crew_flag_at: datetime | None = None
    demo_vehicle: str = "heavy_truck"

    def latest_reading(self, device_id: str) -> dict | None:
        history = self.readings.get(device_id)
        return history[-1] if history else None

    def log(self, kind: str, site_id: str | None, detail: dict, at: datetime) -> None:
        self.timeline.append({"kind": kind, "site_id": site_id, "detail": detail, "at": at.isoformat()})

    def reset(self) -> None:
        self.__init__()


store = Store()
