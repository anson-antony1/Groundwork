from .memory import AppendOnlyRepository, DemoStateRepository, ReadingRepository
from .records import BriefingRecord, DeviceEventRecord, ReportRecord, TimelineRecord

readings = ReadingRepository()
device_events: AppendOnlyRepository[DeviceEventRecord] = AppendOnlyRepository()
reports: AppendOnlyRepository[ReportRecord] = AppendOnlyRepository()
timeline: AppendOnlyRepository[TimelineRecord] = AppendOnlyRepository()
briefings: AppendOnlyRepository[BriefingRecord] = AppendOnlyRepository()
demo_state = DemoStateRepository()


def reset_all() -> None:
    for repo in (readings, device_events, reports, timeline, briefings, demo_state):
        repo.clear()
