from fastapi import APIRouter, Depends

from .. import repositories as repo
from ..schemas.common import PageEnvelope
from ..schemas.responses import TimelineEventOut
from ..services import timeline
from . import mappers
from .deps import PageParams, page_params
from .responses import paged

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=PageEnvelope[TimelineEventOut], summary="Timeline of alerts, reports and acks")
def list_events(page: PageParams = Depends(page_params), site_id: str | None = None):
    mode = "replay" if repo.demo_state.get().replay_active else "live"
    return paged(timeline.list_events(site_id), page, mode, mappers.timeline_out)
