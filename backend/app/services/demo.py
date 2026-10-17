"""Demo-only helpers (README section 14 reset routine)."""
import logging
from dataclasses import dataclass

from .. import repositories as repo
from ..config import UPLOADS_DIR

log = logging.getLogger("groundwork.demo")

# Team label for simulated sensor data (scripts/replay_sensor_v2.py, hardware/serial_bridge.py, hardware/fake_beacon.py).
SIMULATED_CALIBRATION = "simulated_replay_v1"


@dataclass(frozen=True)
class DemoReset:
    replay_stopped: bool
    reports_cleared: int
    device_events_cleared: int
    simulated_readings_cleared: int = 0


def reset_demo() -> DemoReset:
    """End any replay, clear session reports/events/timeline and re-arm the beacon.

    Keeps real sensor readings (the beacon is live) and past briefings (a cached brief is the Gemini
    fallback). Simulated readings are removed, so a fallback test can't leave fake tray data behind.
    """
    replay_was_active = repo.demo_state.get().replay_active
    reports = repo.reports.list()
    for r in reports:
        if r.image_filename:
            (UPLOADS_DIR / r.image_filename).unlink(missing_ok=True)
    events_cleared = len(repo.device_events.list())

    for table in (repo.reports, repo.device_events, repo.timeline, repo.demo_state):
        table.clear()
    simulated_cleared = repo.readings.delete_by_calibration(SIMULATED_CALIBRATION)

    result = DemoReset(replay_was_active, len(reports), events_cleared, simulated_cleared)
    log.info("demo reset", extra=vars(result))
    return result
