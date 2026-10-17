from ..config import DATABASE_PATH
from .records import DeviceEventRecord, ReportRecord, TimelineRecord
from .sqlite import (
    BriefingRepository, DemoStateRepository, ReadingRepository, TableRepository,
    device_events_table, hazard_reports_table, make_engine, timeline_events_table,
)

engine = make_engine(DATABASE_PATH)

readings = ReadingRepository(engine)
device_events: TableRepository[DeviceEventRecord] = TableRepository(
    engine, device_events_table, DeviceEventRecord,
    datetime_fields=("recorded_at", "received_at"), renames={"id": "public_id"},
)
reports: TableRepository[ReportRecord] = TableRepository(
    engine, hazard_reports_table, ReportRecord,
    datetime_fields=("reported_at",), renames={"image_filename": "image_path"},
)
timeline: TableRepository[TimelineRecord] = TableRepository(
    engine, timeline_events_table, TimelineRecord, datetime_fields=("at",),
)
briefings = BriefingRepository(engine)
demo_state = DemoStateRepository(engine)


def reset_all() -> None:
    for repo in (readings, device_events, reports, timeline, briefings, demo_state):
        repo.clear()
