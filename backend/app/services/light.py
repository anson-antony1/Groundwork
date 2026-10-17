"""Low-light advisory for the demo site from the beacon's light sensor (README section 4).

Advisory only: it never changes weather_state, the access call or the beacon display.
No fresh light reading (sensor not connected, or stale) means no note, never a guess.
"""
from ..repositories.records import ReadingRecord

# DEMO POLICY: relative 0-100 light index (two-point calibration, dark = 0, room/phone light = 100).
LOW_LIGHT_BELOW = 25.0


def advisories(reading: ReadingRecord | None) -> tuple[str, ...]:
    if reading is None or reading.light_index is None or reading.light_index >= LOW_LIGHT_BELOW:
        return ()
    recorded = " (recorded demo)" if reading.mode == "sensor_replay" else ""
    return (f"Low light at the demo site{recorded}: light index {reading.light_index:.0f}/100, "
            f"below {LOW_LIGHT_BELOW:.0f}. Advisory only: check lighting before work.",)
