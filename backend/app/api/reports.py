from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..config import MAX_PHOTO_BYTES
from ..core.clock import now_utc
from ..schemas.common import Envelope, PageEnvelope, ReportCategory
from ..schemas.requests import ReportReviewIn
from ..schemas.responses import ReportOut
from ..services import reports
from . import mappers
from ..core.auth import Principal
from .deps import PageParams, page_params, require_role
from .responses import error_responses, ok, paged

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", status_code=201, response_model=Envelope[ReportOut],
             responses=error_responses(401, 403, 404, 413, 415),
             summary="Submit a crew hazard report (multipart); crew or supervisor")
async def create_report(
    site_id: Annotated[str, Form(min_length=1, max_length=64)],
    description: Annotated[str, Form(min_length=1, max_length=500)],
    category_user: Annotated[ReportCategory, Form()] = "other",
    photo: Annotated[UploadFile | None, File(description="JPEG or PNG, max 5 MB")] = None,
    user: Principal = Depends(require_role("crew", "supervisor")),
):
    # Read one byte past the cap so the service can tell "exactly 5 MB" from "too big".
    content = await photo.read(MAX_PHOTO_BYTES + 1) if photo is not None and photo.filename else None
    rec = reports.create_report(site_id, description, category_user, content, now_utc(), reported_by=user.sub)
    return ok(mappers.report_out(rec), "live")


@router.get("", response_model=PageEnvelope[ReportOut], summary="List crew reports, newest first")
def list_reports(page: PageParams = Depends(page_params), site_id: str | None = None):
    return paged(reports.list_reports(site_id), page, "live", mappers.report_out)


@router.get("/{report_id}", response_model=Envelope[ReportOut], responses=error_responses(404),
            summary="One crew report")
def get_report(report_id: str):
    return ok(mappers.report_out(reports.get_report(report_id)), "live")


@router.post("/{report_id}/review", response_model=Envelope[ReportOut], responses=error_responses(401, 403, 404),
             summary="Supervisor confirms or rejects a crew report (optionally correcting its category)")
def review_report(report_id: str, body: ReportReviewIn,
                  user: Principal = Depends(require_role("supervisor"))):
    rec = reports.review_report(report_id, body.verification, body.category_user, now_utc(), verified_by=user.sub)
    return ok(mappers.report_out(rec), "live")
