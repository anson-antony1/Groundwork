from fastapi import APIRouter, Depends

from ..core.clock import now_utc
from ..schemas.common import Envelope, PageEnvelope
from ..schemas.responses import BriefingOut
from ..services import briefings
from . import mappers
from .deps import PageParams, page_params, require_role
from .responses import error_responses, ok, paged

router = APIRouter(prefix="/briefings", tags=["briefings"])


@router.post("/generate", status_code=201, response_model=Envelope[BriefingOut],
             dependencies=[Depends(require_role("supervisor"))], responses=error_responses(401, 403),
             summary="Generate a 6 PM briefing (supervisor)")
def create_briefing():
    b = briefings.generate_briefing(now_utc())
    return ok(mappers.briefing_out(b), b.mode)


@router.get("", response_model=PageEnvelope[BriefingOut], summary="Past briefings, newest first")
def list_briefings(page: PageParams = Depends(page_params)):
    return paged(briefings.list_briefings(), page, "simulated", mappers.briefing_out)


@router.get("/{briefing_id}", response_model=Envelope[BriefingOut], responses=error_responses(404),
            summary="One briefing")
def get_briefing(briefing_id: str):
    b = briefings.get_briefing(briefing_id)
    return ok(mappers.briefing_out(b), b.mode)
