import logging
import uuid
from dataclasses import dataclass
from datetime import datetime

from .. import repositories as repo
from ..config import DEMO_DEVICE_ID, DEMO_SITE_ID
from ..core.errors import NotFoundError, ValidationFailedError
from ..repositories.records import DeviceEventRecord, ReadingRecord
from . import timeline
from .display import Display, build_display, demo_status

log = logging.getLogger("groundwork.devices")

# Registered beacons and the site each one sits at.
DEVICE_SITES = {DEMO_DEVICE_ID: DEMO_SITE_ID}


@dataclass(frozen=True)
class SensorSample:
    seq: int | None
    raw_adc: float | None
    moisture_index: float | None
    light_raw: float | None
    light_index: float | None
    pressure_hpa: float | None
    temp_c: float | None
    calibration: str | None
    recorded_at: datetime
    mode: str


def require_device(device_id: str) -> str:
    """Returns the device's site_id."""
    site_id = DEVICE_SITES.get(device_id)
    if site_id is None:
        raise NotFoundError(f"Device '{device_id}' is not registered.", [{"field": "device_id", "issue": "unknown device"}])
    return site_id


def ingest_reading(device_id: str, site_id: str, sample: SensorSample, now: datetime) -> ReadingRecord:
    if site_id != require_device(device_id):
        raise ValidationFailedError(
            "Request validation failed.", [{"field": "site_id", "issue": f"device '{device_id}' is not at this site"}]
        )
    stored = repo.readings.add(ReadingRecord(device_id=device_id, site_id=site_id, received_at=now, **vars(sample)))
    log.debug("reading ingested", extra={"device_id": device_id, "seq": sample.seq})
    return stored


def latest_reading(device_id: str) -> ReadingRecord:
    require_device(device_id)
    latest = repo.readings.latest(device_id)
    if latest is None:
        raise NotFoundError(f"Device '{device_id}' has not sent any readings yet.")
    return latest


def list_readings(device_id: str) -> list[ReadingRecord]:
    require_device(device_id)
    return repo.readings.list(device_id)


def get_display(device_id: str, now: datetime) -> Display:
    return build_display(device_id, require_device(device_id), now)


def record_event(device_id: str, event: str, seq: int | None, recorded_at: datetime, mode: str, now: datetime) -> DeviceEventRecord:
    site_id = require_device(device_id)
    status_at_event, _ = demo_status(device_id, now)
    state = repo.demo_state.get()

    if event == "ack_touch":
        # Touch acknowledges (silences the alarm); it never clears STOP_WORK.
        if status_at_event == "STOP_WORK" and state.acknowledged_at is None:
            repo.demo_state.update(acknowledged_at=now)
    elif event == "crew_flag":
        # Puts the demo site in SUPERVISOR_REVIEW; never changes weather_state.
        repo.demo_state.update(crew_flag_at=now)

    rec = repo.device_events.add(DeviceEventRecord(
        id=f"evt-{uuid.uuid4().hex[:12]}", device_id=device_id, site_id=site_id, event=event, seq=seq,
        status_at_event=status_at_event, recorded_at=recorded_at, received_at=now, mode=mode,
    ))
    timeline.record(event, f"{event} from {device_id} while {status_at_event}", now, site_id=site_id, ref_id=rec.id)
    log.info("device event recorded", extra={"device_id": device_id, "event": event, "status_at_event": status_at_event})
    return rec


def clear_crew_flag(device_id: str, now: datetime) -> Display:
    """Supervisor resolves a crew flag. Idempotent: clearing an unset flag is a no-op."""
    site_id = require_device(device_id)
    if repo.demo_state.get().crew_flag_at is not None:
        repo.demo_state.update(crew_flag_at=None)
        timeline.record("crew_flag_cleared", f"Crew flag on {device_id} cleared by supervisor", now, site_id=site_id)
        log.info("crew flag cleared", extra={"device_id": device_id})
    return build_display(device_id, site_id, now)


def list_device_events(device_id: str) -> list[DeviceEventRecord]:
    require_device(device_id)
    return repo.device_events.list(device_id=device_id)
