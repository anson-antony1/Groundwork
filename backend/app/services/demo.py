"""Demo-only helpers (README section 14 reset routine)."""
import logging
from dataclasses import dataclass

from .. import repositories as repo
from ..config import UPLOADS_DIR

log = logging.getLogger("groundwork.demo")


@dataclass(frozen=True)
class DemoReset:
    replay_stopped: bool
    reports_cleared: int
    device_events_cleared: int


def reset_demo() -> DemoReset:
    """End any replay, clear session reports/events/timeline and re-arm the beacon.

    Keeps sensor readings (the beacon is live) and past briefings (a cached brief is the Gemini fallback).
    """
    replay_was_active = repo.demo_state.get().replay_active
    reports = repo.reports.list()
    for r in reports:
        if r.image_filename:
            (UPLOADS_DIR / r.image_filename).unlink(missing_ok=True)
    events_cleared = len(repo.device_events.list())

    for table in (repo.reports, repo.device_events, repo.timeline, repo.demo_state):
        table.clear()

    result = DemoReset(replay_was_active, len(reports), events_cleared)
    log.info("demo reset", extra=vars(result))
    return result
