from fastapi import APIRouter, Query

from ..envelope import envelope
from ..state import store

router = APIRouter(tags=["events"])


@router.get("/events")
def list_events(site_id: str | None = Query(None), limit: int = Query(200, ge=1, le=2000)):
    # Site-less events (replay start/stop) apply to every site, so they're always included.
    rows = [e for e in store.timeline if site_id is None or e["site_id"] in (site_id, None)]
    return envelope(rows[-limit:], "replay" if store.replay_active else "live")
