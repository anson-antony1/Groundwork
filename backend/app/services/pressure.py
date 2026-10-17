"""3-hour pressure tendency from the beacon's barometer (README section 4 and the section 15 test list).

Advisory only: venue station pressure from the demo beacon. It never triggers STOP WORK; only
official NWS alerts do. With under 3 hours of live history the answer is UNKNOWN, never "steady".
Only live readings (mode sensor_demo) count, so a replayed or simulated CSV can't fake a trend.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from .. import repositories as repo
from .devices import require_device

WINDOW = timedelta(hours=3)
ENDPOINT = timedelta(minutes=10)  # average this long at each end to smooth sensor noise
FRESH = timedelta(minutes=15)     # no tendency if the newest barometer reading is older than this
ADVISORY = "Advisory only: venue station pressure from the demo beacon; never a STOP WORK trigger."


@dataclass(frozen=True)
class PressureTendency:
    device_id: str
    tendency: str
    change_hpa: float | None
    start_at: datetime | None
    end_at: datetime | None
    samples: int
    reason: str


def classify(change_hpa: float) -> str:
    """UK Met Office terms for the change over 3 hours."""
    size = abs(change_hpa)
    if size < 0.1:
        return "STEADY"
    direction = "RISING" if change_hpa > 0 else "FALLING"
    if size < 1.6:
        return f"{direction}_SLOWLY"
    if size < 3.6:
        return direction
    if size <= 6.0:
        return f"{direction}_QUICKLY"
    return f"{direction}_VERY_RAPIDLY"


def pressure_tendency(device_id: str, now: datetime) -> PressureTendency:
    require_device(device_id)
    rows = repo.readings.live_pressure_since(device_id, now - WINDOW - 2 * ENDPOINT)

    def unknown(reason: str) -> PressureTendency:
        return PressureTendency(device_id, "UNKNOWN", None, None, None, len(rows), reason)

    if not rows:
        return unknown("No live barometer readings in the last 3 hours.")
    latest = max(rows, key=lambda r: r.recorded_at)
    if now - latest.received_at > FRESH:
        return unknown("No live barometer reading in the last 15 minutes.")
    target = latest.recorded_at - WINDOW
    earliest = min(r.recorded_at for r in rows)
    if earliest > target + ENDPOINT:
        held = (latest.recorded_at - earliest).total_seconds() / 3600
        return unknown(f"Only {held:.1f} h of live barometer history; a tendency needs 3 h.")
    start = [r for r in rows if abs(r.recorded_at - target) <= ENDPOINT]
    if not start:
        return unknown("No barometer readings from about 3 hours ago (gap in the log).")
    end = [r for r in rows if r.recorded_at >= latest.recorded_at - ENDPOINT]

    def mean(rs):
        return sum(r.pressure_hpa for r in rs) / len(rs)

    change = round(mean(end) - mean(start), 2)
    tendency = classify(change)
    return PressureTendency(
        device_id, tendency, change, min(r.recorded_at for r in start), latest.recorded_at, len(rows),
        f"Station pressure changed {change:+.2f} hPa over 3 hours ({tendency.replace('_', ' ').lower()}).",
    )
