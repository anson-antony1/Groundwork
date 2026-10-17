from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from ..core.clock import now_utc
from ..schemas.common import Envelope, PageEnvelope
from ..schemas.requests import SensorReadingIn
from ..schemas.responses import PressureTendencyOut, ReadingOut
from ..services import devices, pressure
from . import mappers
from .deps import PageParams, page_params, require_sensor_token
from .responses import error_responses, ok, paged

router = APIRouter(prefix="/sensors", tags=["sensors"])


@router.post("/readings", status_code=201, response_model=Envelope[ReadingOut],
             dependencies=[Depends(require_sensor_token)], responses=error_responses(400, 401, 404),
             summary="Ingest one beacon reading")
def create_reading(body: SensorReadingIn):
    sample = devices.SensorSample(**body.model_dump(exclude={"device_id", "site_id"}))
    rec = devices.ingest_reading(body.device_id, body.site_id, sample, now_utc())
    return ok(mappers.reading_out(rec), rec.mode)


@router.get("/{device_id}/latest", response_model=Envelope[ReadingOut], responses=error_responses(404),
            summary="Most recent reading")
def get_latest_reading(device_id: str):
    rec = devices.latest_reading(device_id)
    return ok(mappers.reading_out(rec), rec.mode)


@router.get("/{device_id}/history", response_model=PageEnvelope[ReadingOut], responses=error_responses(404),
            summary="Reading history, newest first")
def get_reading_history(
    device_id: str,
    page: PageParams = Depends(page_params),
    since: datetime | None = Query(None, description="Only readings recorded at or after this time (ISO 8601; no offset = UTC)"),
):
    rows = devices.list_readings(device_id)
    if since is not None:
        since = since if since.tzinfo else since.replace(tzinfo=timezone.utc)
        rows = [r for r in rows if r.recorded_at >= since]
    return paged(rows, page, rows[0].mode if rows else "sensor_demo", mappers.reading_out)


@router.get("/{device_id}/pressure-tendency", response_model=Envelope[PressureTendencyOut],
            responses=error_responses(404), summary="3-hour station pressure tendency (advisory only)")
def get_pressure_tendency(device_id: str):
    t = pressure.pressure_tendency(device_id, now_utc())
    return ok(PressureTendencyOut(**vars(t), advisory=pressure.ADVISORY), "sensor_demo")
