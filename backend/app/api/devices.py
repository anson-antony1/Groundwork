from fastapi import APIRouter, Depends

from ..core.clock import now_utc
from ..schemas.common import Envelope, PageEnvelope
from ..schemas.requests import DeviceEventIn
from ..schemas.responses import DeviceEventOut, DisplayOut
from ..services import devices
from . import mappers
from .deps import PageParams, page_params, require_sensor_token
from .responses import error_responses, ok, paged

router = APIRouter(prefix="/devices/{device_id}", tags=["devices"])


@router.get("/display", response_model=DisplayOut, responses=error_responses(404),
            summary="What the beacon LCD/LEDs/buzzer should show")
def get_display(device_id: str):
    # Flat payload (no envelope), exactly as the serial bridge expects it (README 5.8).
    return mappers.display_out(devices.get_display(device_id, now_utc()), now_utc())


@router.post("/events", status_code=201, response_model=Envelope[DeviceEventOut],
             dependencies=[Depends(require_sensor_token)], responses=error_responses(400, 401, 404),
             summary="Record a beacon event (ack_touch, crew_flag)")
def create_event(device_id: str, body: DeviceEventIn):
    rec = devices.record_event(device_id, body.event, body.seq, body.recorded_at, body.mode, now_utc())
    return ok(mappers.device_event_out(rec), rec.mode)


@router.get("/events", response_model=PageEnvelope[DeviceEventOut], responses=error_responses(404),
            summary="Acknowledgment and crew-flag log, newest first")
def list_events(device_id: str, page: PageParams = Depends(page_params)):
    return paged(devices.list_device_events(device_id), page, "sensor_demo", mappers.device_event_out)
