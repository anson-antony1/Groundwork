"""SQLite repositories (SQLAlchemy Core). Table layouts follow README section 10.

Timestamps are stored as ISO-8601 text. List methods return newest first.
"""
import json
from dataclasses import asdict, fields, replace
from datetime import datetime
from pathlib import Path
from typing import Generic, TypeVar

from sqlalchemy import (
    Column, Engine, Float, Integer, MetaData, String, Table, Text, create_engine, delete, insert, literal_column, select, update,
)

from .records import BriefingRecord, DemoState, PrioritySite, ReadingRecord, ReportRecord

R = TypeVar("R")

# Newest-N cap for reading history queries (the beacon posts ~1 reading per second).
HISTORY_LIMIT = 5000

metadata = MetaData()

sensor_readings_table = Table(
    "sensor_readings", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("device_id", String, nullable=False, index=True),
    Column("site_id", String, nullable=False),
    Column("seq", Integer),
    Column("raw_adc", Float),
    Column("moisture_index", Float),
    Column("light_raw", Float),
    Column("light_index", Float),
    Column("pressure_hpa", Float),
    Column("temp_c", Float),
    Column("calibration", String),
    Column("recorded_at", String, nullable=False),
    Column("received_at", String, nullable=False),  # server time; used for staleness
    Column("mode", String, nullable=False),
)

device_events_table = Table(
    "device_events", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("public_id", String, nullable=False, unique=True),
    Column("device_id", String, nullable=False, index=True),
    Column("site_id", String),
    Column("event", String, nullable=False),
    Column("seq", Integer),
    Column("status_at_event", String),
    Column("recorded_at", String, nullable=False),
    Column("received_at", String, nullable=False),
    Column("mode", String),
)

hazard_reports_table = Table(
    "hazard_reports", metadata,
    Column("id", String, primary_key=True),
    Column("site_id", String, nullable=False, index=True),
    Column("description", Text, nullable=False),
    Column("category_user", String),
    Column("category_ai", String),
    Column("ai_confidence", Float),
    Column("image_path", String),  # filename inside UPLOADS_DIR
    Column("reported_at", String, nullable=False),
    Column("verification", String, nullable=False),
)

briefing_runs_table = Table(
    "briefing_runs", metadata,
    Column("id", String, primary_key=True),
    Column("generated_at", String, nullable=False),
    Column("snapshot_json", Text, nullable=False),
    Column("narrative", Text, nullable=False),
    Column("mode", String, nullable=False),
)

timeline_events_table = Table(
    "timeline_events", metadata,
    Column("id", String, primary_key=True),
    Column("kind", String, nullable=False),
    Column("site_id", String, index=True),
    Column("summary", Text, nullable=False),
    Column("ref_id", String),
    Column("at", String, nullable=False),
)

demo_state_table = Table(
    "demo_state", metadata,
    Column("id", Integer, primary_key=True),  # single row, id = 1
    Column("state_json", Text, nullable=False),
)

NEWEST_FIRST = literal_column("rowid").desc()


def make_engine(path: Path) -> Engine:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    metadata.create_all(engine)
    return engine


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value is not None else None


class TableRepository(Generic[R]):
    """Maps a frozen dataclass record to one table. `renames` maps record field -> column name."""

    def __init__(self, engine: Engine, table: Table, record_cls: type[R],
                 datetime_fields: tuple[str, ...] = (), renames: dict[str, str] | None = None):
        self._engine = engine
        self._table = table
        self._cls = record_cls
        self._dt_fields = set(datetime_fields)
        self._renames = renames or {}

    def _col(self, field_name: str):
        return self._table.c[self._renames.get(field_name, field_name)]

    def _to_row(self, rec: R) -> dict:
        row = {}
        for f in fields(rec):
            value = getattr(rec, f.name)
            row[self._renames.get(f.name, f.name)] = _iso(value) if f.name in self._dt_fields else value
        return row

    def _to_record(self, row) -> R:
        m = row._mapping
        kwargs = {}
        for f in fields(self._cls):
            value = m[self._renames.get(f.name, f.name)]
            kwargs[f.name] = _dt(value) if f.name in self._dt_fields else value
        return self._cls(**kwargs)

    def add(self, rec: R) -> R:
        with self._engine.begin() as conn:
            conn.execute(insert(self._table).values(self._to_row(rec)))
        return rec

    def get(self, record_id: str) -> R | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(self._table).where(self._col("id") == record_id)).first()
        return self._to_record(row) if row else None

    def list(self, limit: int | None = None, **filters) -> list[R]:
        query = select(self._table).order_by(NEWEST_FIRST)
        for name, value in filters.items():
            query = query.where(self._col(name) == value)
        if limit is not None:
            query = query.limit(limit)
        with self._engine.connect() as conn:
            return [self._to_record(r) for r in conn.execute(query)]

    def save(self, rec: R) -> R:
        """Overwrite an existing record (matched on id)."""
        with self._engine.begin() as conn:
            conn.execute(update(self._table).where(self._col("id") == rec.id).values(self._to_row(rec)))
        return rec

    def clear(self) -> None:
        with self._engine.begin() as conn:
            conn.execute(delete(self._table))


class ReadingRepository(TableRepository[ReadingRecord]):
    def __init__(self, engine: Engine):
        super().__init__(engine, sensor_readings_table, ReadingRecord,
                         datetime_fields=("recorded_at", "received_at"), renames={"row_id": "id"})

    def add(self, rec: ReadingRecord) -> ReadingRecord:
        row = self._to_row(rec)
        row.pop("id")  # autoincrement
        with self._engine.begin() as conn:
            pk = conn.execute(insert(self._table).values(row)).inserted_primary_key[0]
        return replace(rec, row_id=pk)

    def latest(self, device_id: str) -> ReadingRecord | None:
        rows = super().list(limit=1, device_id=device_id)
        return rows[0] if rows else None

    def list(self, device_id: str) -> list[ReadingRecord]:
        return super().list(limit=HISTORY_LIMIT, device_id=device_id)

    def delete_by_calibration(self, calibration: str) -> int:
        with self._engine.begin() as conn:
            return conn.execute(delete(self._table).where(self._table.c.calibration == calibration)).rowcount


def _report_to_json(r: ReportRecord) -> dict:
    return {**asdict(r), "reported_at": _iso(r.reported_at)}


def _report_from_json(d: dict) -> ReportRecord:
    return ReportRecord(**{**d, "reported_at": _dt(d["reported_at"])})


class BriefingRepository(TableRepository[BriefingRecord]):
    """Stores the full briefing as snapshot_json, so a past brief reads back exactly as generated."""

    def __init__(self, engine: Engine):
        super().__init__(engine, briefing_runs_table, BriefingRecord)

    def _to_row(self, b: BriefingRecord) -> dict:
        snapshot = {
            "top_priority_sites": [asdict(p) for p in b.top_priority_sites],
            "stop_work_site_ids": list(b.stop_work_site_ids),
            "missing_data_notes": [[sid, list(f)] for sid, f in b.missing_data_notes],
            "crew_report_followups": [_report_to_json(r) for r in b.crew_report_followups],
            "narrative_source": b.narrative_source,
        }
        return {"id": b.id, "generated_at": _iso(b.generated_at), "snapshot_json": json.dumps(snapshot),
                "narrative": b.summary, "mode": b.mode}

    def _to_record(self, row) -> BriefingRecord:
        m = row._mapping
        s = json.loads(m["snapshot_json"])
        return BriefingRecord(
            id=m["id"], generated_at=_dt(m["generated_at"]), mode=m["mode"], summary=m["narrative"],
            top_priority_sites=tuple(PrioritySite(**p) for p in s["top_priority_sites"]),
            stop_work_site_ids=tuple(s["stop_work_site_ids"]),
            missing_data_notes=tuple((sid, tuple(f)) for sid, f in s["missing_data_notes"]),
            crew_report_followups=tuple(_report_from_json(r) for r in s["crew_report_followups"]),
            narrative_source=s["narrative_source"],
        )


_DEMO_DT_FIELDS = ("replay_started_at", "acknowledged_at", "crew_flag_at")


class DemoStateRepository:
    """Single-row table holding the beacon/replay state, so an alarm ack survives a restart."""

    def __init__(self, engine: Engine):
        self._engine = engine

    def get(self) -> DemoState:
        with self._engine.connect() as conn:
            row = conn.execute(select(demo_state_table.c.state_json).where(demo_state_table.c.id == 1)).first()
        if row is None:
            return DemoState()
        data = json.loads(row[0])
        return DemoState(**{**data, **{k: _dt(data[k]) for k in _DEMO_DT_FIELDS}})

    def update(self, **changes) -> DemoState:
        state = replace(self.get(), **changes)
        data = {**asdict(state), **{k: _iso(getattr(state, k)) for k in _DEMO_DT_FIELDS}}
        with self._engine.begin() as conn:
            conn.execute(delete(demo_state_table))
            conn.execute(insert(demo_state_table).values(id=1, state_json=json.dumps(data)))
        return state

    def clear(self) -> None:
        with self._engine.begin() as conn:
            conn.execute(delete(demo_state_table))
