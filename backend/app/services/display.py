"""Server-side status for the beacon. The firmware only renders what this returns."""
from dataclasses import dataclass
from datetime import datetime

from .. import repositories as repo
from ..config import SENSOR_STALE_SECONDS
from ..repositories.records import ReadingRecord
from .access import demo_tray_access

# effective_status -> (serial code, LCD line 2)
STATUS_DISPLAY = {
    "GO_FOR_REVIEW": ("GO", "GO FOR REVIEW"),
    "MATS_FOR_REVIEW": ("MATS", "MATS FOR REVIEW"),
    "SUPERVISOR_REVIEW": ("REVIEW", "SUPV REVIEW"),
    "NO_GO_FOR_REVIEW": ("NOGO", "NO GO - REVIEW"),
    "STOP_WORK": ("STOP", "STOP WORK - ACK?"),
    "UNKNOWN": ("UNKNOWN", "NO SENSOR DATA"),
}
VEHICLE_TAG = {"pickup": "PKP", "heavy_truck": "HVY"}


@dataclass(frozen=True)
class Display:
    device_id: str
    site_id: str
    effective_status: str
    code: str
    lcd_line1: str
    lcd_line2: str
    alarm: bool
    acknowledged_at: datetime | None
    mode: str
    vehicle: str | None = None  # the vehicle the access call is for (also tagged PKP/HVY on lcd_line1)


def lcd_text(text: str) -> str:
    """16 printable ASCII chars, no '|' (it's the serial field separator)."""
    clean = "".join(ch for ch in text if 32 <= ord(ch) < 127 and ch != "|")
    return clean[:16]


def fresh_reading(device_id: str, now: datetime) -> ReadingRecord | None:
    latest = repo.readings.latest(device_id)
    if latest is None or (now - latest.received_at).total_seconds() > SENSOR_STALE_SECONDS:
        return None
    return latest


def tray_lightning(now: datetime):
    """Lightning within 10 mi of the demo tray (field_hazards), or None. Never during a replay."""
    from ..config import DEMO_SITE_ID
    from . import field_hazards
    from .sites import load_sites
    tray = next((s for s in load_sites() if s.id == DEMO_SITE_ID), None)
    return field_hazards.lightning_at(tray.latitude, tray.longitude, now) if tray else None


def demo_status(device_id: str, now: datetime) -> tuple[str, str]:
    """Returns (effective_status, mode). Precedence: STOP_WORK > crew flag > ground access."""
    state = repo.demo_state.get()
    if state.replay_active:
        return "STOP_WORK", "replay"
    reading = fresh_reading(device_id, now)
    mode = reading.mode if reading else "sensor_demo"
    if tray_lightning(now):
        return "STOP_WORK", mode
    if state.crew_flag_at is not None:
        return "SUPERVISOR_REVIEW", mode
    if reading is None:
        return "UNKNOWN", mode
    return demo_tray_access(reading.moisture_index, state.demo_vehicle), mode


def build_display(device_id: str, site_id: str, now: datetime) -> Display:
    state = repo.demo_state.get()
    status, mode = demo_status(device_id, now)
    code, line2 = STATUS_DISPLAY[status]
    acked = status == "STOP_WORK" and state.acknowledged_at is not None
    bolt = tray_lightning(now) if status == "STOP_WORK" and not state.replay_active else None
    if bolt:  # 30-minute all clear that restarts with each strike, ticking on the LCD
        from .field_hazards import countdown
        line2 = f"{'ACKD' if acked else 'STOP'} - CLR {countdown(bolt, now)}"
    return Display(
        device_id=device_id,
        site_id=site_id,
        effective_status=status,
        code=code,
        lcd_line1=lcd_text(f"DEMO TRAY   {VEHICLE_TAG[state.demo_vehicle]}"),
        lcd_line2=lcd_text(line2 if bolt or not acked else "STOP WORK - ACKD"),
        alarm=status == "STOP_WORK" and not acked,
        acknowledged_at=state.acknowledged_at if acked else None,
        mode=mode,
        vehicle=state.demo_vehicle,
    )
