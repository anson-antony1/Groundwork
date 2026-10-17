from fastapi import APIRouter, Depends, HTTPException, Query

from ..envelope import envelope, now_utc
from ..schemas import SensorReading
from ..state import store
from .deps import require_sensor_token

router = APIRouter(prefix="/sensors", tags=["sensors"])


def _serialize(r: dict) -> dict:
    return {**r, "recorded_at": r["recorded_at"].isoformat(), "received_at": r["received_at"].isoformat()}


@router.post("/readings", status_code=201, dependencies=[Depends(require_sensor_token)])
def ingest_reading(reading: SensorReading):
    row = {**reading.model_dump(), "received_at": now_utc()}
    store.readings[reading.device_id].append(row)
    return envelope(_serialize(row), reading.mode)


@router.get("/{device_id}/latest")
def latest_reading(device_id: str):
    latest = store.latest_reading(device_id)
    if latest is None:
        raise HTTPException(404, f"No readings yet for device {device_id!r}")
    return envelope(_serialize(latest), latest["mode"])


@router.get("/{device_id}/history")
def reading_history(device_id: str, limit: int = Query(300, ge=1, le=5000)):
    rows = list(store.readings.get(device_id, []))[-limit:]
    mode = rows[-1]["mode"] if rows else "sensor_demo"
    return envelope([_serialize(r) for r in rows], mode)
