"""Server-side status for the beacon. The firmware only renders what this returns."""
from datetime import datetime

from ..config import DEMO_SITE_ID, SENSOR_STALE_SECONDS
from ..state import Store
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


def lcd_text(text: str) -> str:
    """16 printable ASCII chars, no '|' (it's the serial field separator)."""
    clean = "".join(ch for ch in text if 32 <= ord(ch) < 127 and ch != "|")
    return clean[:16]


def fresh_reading(store: Store, device_id: str, now: datetime) -> dict | None:
    latest = store.latest_reading(device_id)
    if latest is None:
        return None
    if (now - latest["received_at"]).total_seconds() > SENSOR_STALE_SECONDS:
        return None
    return latest


def demo_status(store: Store, device_id: str, now: datetime) -> tuple[str, str]:
    """Returns (effective_status, mode). Precedence: STOP_WORK > crew flag > ground access."""
    if store.replay_active:
        return "STOP_WORK", "replay"
    reading = fresh_reading(store, device_id, now)
    mode = reading["mode"] if reading else "sensor_demo"
    if store.crew_flag_at is not None:
        return "SUPERVISOR_REVIEW", mode
    if reading is None:
        return "UNKNOWN", mode
    return demo_tray_access(reading.get("moisture_index"), store.demo_vehicle), mode


def build_display(store: Store, device_id: str, now: datetime) -> dict:
    status, mode = demo_status(store, device_id, now)
    code, line2 = STATUS_DISPLAY[status]
    acked = status == "STOP_WORK" and store.acknowledged_at is not None
    if acked:
        line2 = "STOP WORK - ACKD"
    return {
        "device_id": device_id,
        "site_id": DEMO_SITE_ID,
        "effective_status": status,
        "code": code,
        "lcd_line1": lcd_text(f"DEMO TRAY   {VEHICLE_TAG[store.demo_vehicle]}"),
        "lcd_line2": lcd_text(line2),
        "alarm": status == "STOP_WORK" and not acked,
        "acknowledged_at": store.acknowledged_at.isoformat() if acked else None,
        "mode": mode,
        "generated_at": now.isoformat(),
    }
