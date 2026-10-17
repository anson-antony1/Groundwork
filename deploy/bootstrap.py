"""Background jobs for hosted Groundwork, started next to uvicorn by deploy/start.sh.

1. Once the API answers, write a 6 PM plan if none is saved, so /briefing isn't empty after a restart wipes
   the database. The plan goes straight to the database, because with login on the HTTP route needs a
   supervisor. It uses the template narrative, which keeps Gemini's free daily quota for supervisors.
2. With GROUNDWORK_REFRESH_WEATHER=1, refresh the weather snapshot and write a fresh plan from it, then refresh
   the wildfire and wildlife snapshot; both again every 3 h while the instance is awake. The backend's refresh
   scripts (backend/scripts/refresh_weather_loop_v2.py, refresh_hazards_loop_v1.py) fetch into a temp file and
   swap it in atomically, keeping the previous snapshot if a fetch fails.
"""
import logging
import os
import time

import httpx

API = f"http://127.0.0.1:{os.environ.get('PORT', '8010')}/api/v1"
REFRESH_EVERY_S = 3 * 60 * 60


def log(message: str) -> None:
    print(f"[bootstrap] {message}", flush=True)


def wait_for_api(timeout_s: float = 180) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            if httpx.get(f"{API}/health", timeout=5).status_code == 200:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(1)
    return False


def has_plan() -> bool:
    from backend.app.services import briefings

    return bool(briefings.list_briefings())


def write_plan() -> None:
    """Generate and save a 6 PM plan in this process, narrated by the template instead of Gemini."""
    from backend.app.core.clock import now_utc
    from backend.app.services import briefings, narration

    narrate = narration.narrate
    narration.narrate = lambda facts: None
    try:
        log(f"wrote a 6 PM plan ({briefings.generate_briefing(now_utc()).narrative_source})")
    except Exception as exc:  # the plan is a convenience: never let it stop the refreshes
        log(f"could not write a plan: {exc!r}")
    finally:
        narration.narrate = narrate


def refresh(name: str, refresh_once) -> bool:
    try:
        ok = refresh_once()
    except Exception as exc:  # network errors or upstream API changes: the previous snapshot stays
        log(f"{name} refresh failed: {exc!r}")
        return False
    log(f"{name} refreshed" if ok else f"{name} refresh kept the previous snapshot")
    return ok


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[bootstrap] %(name)s: %(message)s")
    if not wait_for_api():
        log("the API never answered /health")
    elif not has_plan():
        write_plan()
    if os.environ.get("GROUNDWORK_REFRESH_WEATHER") != "1":
        return
    from backend.scripts import refresh_hazards_loop_v1, refresh_weather_loop_v2

    boot = True
    while True:
        if refresh("weather", refresh_weather_loop_v2.refresh_once) and boot:
            write_plan()  # the boot plan used the committed snapshot; this one uses fresh weather
        refresh("hazards", refresh_hazards_loop_v1.refresh_once)
        boot = False
        time.sleep(REFRESH_EVERY_S)


if __name__ == "__main__":
    main()
