"""In-memory repositories. Swap for SQLAlchemy/SQLite implementations with the same methods later.

All data resets when the process restarts, including on uvicorn --reload.
List methods return newest first.
"""
from collections import defaultdict, deque
from dataclasses import replace
from typing import Generic, TypeVar

from .records import DemoState, ReadingRecord

R = TypeVar("R")


class ReadingRepository:
    def __init__(self, history_limit: int = 5000):
        self._history_limit = history_limit
        self.clear()

    def add(self, record: ReadingRecord) -> ReadingRecord:
        stored = replace(record, row_id=self._next_id)
        self._next_id += 1
        self._by_device[record.device_id].append(stored)
        return stored

    def latest(self, device_id: str) -> ReadingRecord | None:
        rows = self._by_device.get(device_id)
        return rows[-1] if rows else None

    def list(self, device_id: str) -> list[ReadingRecord]:
        return list(reversed(self._by_device.get(device_id, ())))

    def clear(self) -> None:
        self._by_device: dict[str, deque[ReadingRecord]] = defaultdict(lambda: deque(maxlen=self._history_limit))
        self._next_id = 1


class AppendOnlyRepository(Generic[R]):
    """Records with an `id`, optionally filtered by an attribute (e.g. site_id, device_id)."""

    def __init__(self) -> None:
        self.clear()

    def add(self, record: R) -> R:
        self._rows.append(record)
        self._by_id[record.id] = record
        return record

    def get(self, record_id: str) -> R | None:
        return self._by_id.get(record_id)

    def list(self, **filters) -> list[R]:
        rows = [r for r in self._rows if all(getattr(r, k) == v for k, v in filters.items())]
        return list(reversed(rows))

    def clear(self) -> None:
        self._rows: list[R] = []
        self._by_id: dict[str, R] = {}


class DemoStateRepository:
    def __init__(self) -> None:
        self.clear()

    def get(self) -> DemoState:
        return self._state

    def update(self, **changes) -> DemoState:
        self._state = replace(self._state, **changes)
        return self._state

    def clear(self) -> None:
        self._state = DemoState()
