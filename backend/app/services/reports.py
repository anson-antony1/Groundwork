import logging
import uuid
from dataclasses import replace
from datetime import datetime

from .. import repositories as repo
from ..config import MAX_PHOTO_BYTES, UPLOADS_DIR
from ..core.errors import NotFoundError, PayloadTooLargeError, UnsupportedMediaTypeError, ValidationFailedError
from ..repositories.records import ReportRecord
from . import timeline
from .sites import require_site

log = logging.getLogger("groundwork.reports")

# Magic bytes -> file extension. Trust the bytes, not the client's content-type.
IMAGE_SIGNATURES = {b"\xff\xd8\xff": ".jpg", b"\x89PNG\r\n\x1a\n": ".png"}


def _image_ext(content: bytes) -> str:
    if len(content) > MAX_PHOTO_BYTES:
        raise PayloadTooLargeError("Photo exceeds the 5 MB limit.", [{"field": "photo", "issue": "too large"}])
    ext = next((ext for sig, ext in IMAGE_SIGNATURES.items() if content.startswith(sig)), None)
    if ext is None:
        raise UnsupportedMediaTypeError("Photo must be a JPEG or PNG.", [{"field": "photo", "issue": "unsupported format"}])
    return ext


def create_report(site_id: str, description: str, category: str, photo: bytes | None, now: datetime) -> ReportRecord:
    require_site(site_id)
    description = description.strip()
    if not description:
        raise ValidationFailedError("Request validation failed.", [{"field": "description", "issue": "must not be blank"}])

    report_id = f"report-{uuid.uuid4().hex[:12]}"
    filename = None
    if photo:
        filename = f"{report_id}{_image_ext(photo)}"
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOADS_DIR / filename).write_bytes(photo)

    rec = repo.reports.add(ReportRecord(
        id=report_id, site_id=site_id, description=description, category_user=category,
        category_ai=None, ai_confidence=None,  # filled by the advisory image tagger later
        image_filename=filename, reported_at=now, verification="unreviewed",
    ))
    timeline.record("hazard_report", f"Crew report ({category}): {description[:80]}", now, site_id=site_id, ref_id=report_id)
    log.info("report created", extra={"report_id": report_id, "site_id": site_id, "has_photo": filename is not None})
    return rec


def review_report(report_id: str, verification: str, category_user: str | None, now: datetime) -> ReportRecord:
    """Supervisor confirms or rejects a crew report, optionally correcting its category.

    Re-reviewing is allowed (a supervisor can correct a mistake); each review is logged on the timeline.
    """
    rec = get_report(report_id)
    updated = replace(rec, verification=verification, category_user=category_user or rec.category_user)
    repo.reports.save(updated)
    timeline.record("report_reviewed", f"Crew report {verification} ({updated.category_user})", now,
                    site_id=rec.site_id, ref_id=report_id)
    log.info("report reviewed", extra={"report_id": report_id, "verification": verification,
                                       "category_user": updated.category_user})
    return updated


def get_report(report_id: str) -> ReportRecord:
    rec = repo.reports.get(report_id)
    if rec is None:
        raise NotFoundError(f"Report '{report_id}' does not exist.")
    return rec


def list_reports(site_id: str | None = None) -> list[ReportRecord]:
    return repo.reports.list(site_id=site_id) if site_id else repo.reports.list()
