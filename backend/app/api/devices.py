from fastapi import APIRouter, Depends

from ..config import DEMO_SITE_ID
from ..envelope import envelope, now_utc
from ..schemas import DeviceEvent
from ..services.display import build_display, demo_status
from ..state import store
from .deps import require_sensor_token

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("/{device_id}/display")
def device_display(device_id: str):
    # Returned bare (not enveloped): this is the exact payload the serial bridge consumes (README 5.8).
    return build_display(store, device_id, now_utc())


@router.post("/{device_id}/events", status_code=201, dependencies=[Depends(require_sensor_token)])
def device_event(device_id: str, ev: DeviceEvent):
    now = now_utc()
    status_at_event, _ = demo_status(store, device_id, now)

    if ev.event == "ack_touch":
        # Touch acknowledges (silences the alarm); it never clears STOP_WORK.
        if status_at_event == "STOP_WORK" and store.acknowledged_at is None:
            store.acknowledged_at = now
    elif ev.event == "crew_flag":
        # Puts the demo site in SUPERVISOR_REVIEW; never changes weather_state.
        store.crew_flag_at = now

    row = {
        "device_id": device_id,
        "site_id": DEMO_SITE_ID,
        "event": ev.event,
        "seq": ev.seq,
        "status_at_event": status_at_event,
        "recorded_at": ev.recorded_at.isoformat(),
        "received_at": now.isoformat(),
        "mode": ev.mode,
    }
    store.device_events.append(row)
    store.log(ev.event, DEMO_SITE_ID, row, now)
    return envelope(row, ev.mode)
