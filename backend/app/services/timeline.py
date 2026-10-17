import uuid
from datetime import datetime

from .. import repositories as repo
from ..repositories.records import TimelineRecord


def record(kind: str, summary: str, at: datetime, site_id: str | None = None, ref_id: str | None = None) -> None:
    repo.timeline.add(TimelineRecord(
        id=f"tl-{uuid.uuid4().hex[:12]}", kind=kind, site_id=site_id, summary=summary, ref_id=ref_id, at=at,
    ))


def list_events(site_id: str | None = None) -> list[TimelineRecord]:
    rows = repo.timeline.list()
    if site_id is None:
        return rows
    # Site-less events (replay start/stop) apply to every site, so they're included.
    return [r for r in rows if r.site_id in (site_id, None)]
