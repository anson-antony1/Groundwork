import uuid

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from ..config import MAX_PHOTO_BYTES, UPLOADS_DIR
from ..envelope import envelope, now_utc
from ..schemas import ReportCategory
from ..services.sites import get_site
from ..state import store

router = APIRouter(prefix="/reports", tags=["reports"])

# Magic bytes -> file extension. Trust the bytes, not the client's content-type.
IMAGE_SIGNATURES = {b"\xff\xd8\xff": ".jpg", b"\x89PNG\r\n\x1a\n": ".png"}


def _image_ext(head: bytes) -> str | None:
    return next((ext for sig, ext in IMAGE_SIGNATURES.items() if head.startswith(sig)), None)


@router.post("", status_code=201)
async def create_report(
    site_id: str = Form(...),
    description: str = Form(..., min_length=1, max_length=500),
    category_user: ReportCategory = Form("other"),
    photo: UploadFile | None = File(None),
):
    if get_site(site_id) is None:
        raise HTTPException(404, f"Unknown site_id {site_id!r}")

    report_id = f"report-{uuid.uuid4().hex[:8]}"
    image_path = None
    if photo is not None and photo.filename:
        content = await photo.read(MAX_PHOTO_BYTES + 1)
        if len(content) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Photo exceeds 5 MB")
        ext = _image_ext(content[:8])
        if ext is None:
            raise HTTPException(415, "Photo must be a JPEG or PNG")
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOADS_DIR / f"{report_id}{ext}").write_bytes(content)
        image_path = f"/uploads/{report_id}{ext}"

    now = now_utc()
    report = {
        "id": report_id,
        "site_id": site_id,
        "description": description.strip(),
        "category_user": category_user,
        "category_ai": None,  # filled by Rithika's advisory tagger later
        "ai_confidence": None,
        "image_path": image_path,
        "reported_at": now.isoformat(),
        "verification": "unreviewed",
    }
    store.reports.append(report)
    store.log("hazard_report", site_id, {"report_id": report_id, "category_user": category_user}, now)
    return envelope(report, "live")


@router.get("")
def list_reports(site_id: str | None = Query(None)):
    rows = [r for r in store.reports if site_id is None or r["site_id"] == site_id]
    return envelope(rows, "live")
