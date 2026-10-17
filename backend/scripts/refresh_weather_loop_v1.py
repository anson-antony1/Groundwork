"""Keep the weather snapshot fresh on a hosted backend: refresh now, then every N hours.

The API re-reads fixtures/weather_snapshot.json whenever the file changes (services/weather.py), and
marks it stale after 6 hours. This runs backend.scripts.fetch_weather into a temp file in the same
folder and swaps it in with os.replace (atomic), so a request never reads a half-written file. If a
refresh fails or returns no sites, the previous snapshot stays.

Render start command (Python service):
    python -m backend.scripts.refresh_weather_loop_v1 & uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
One refresh only:
    python -m backend.scripts.refresh_weather_loop_v1 --once
"""
import argparse
import json
import logging
import os
import tempfile
import time
from pathlib import Path

from backend.app.services.weather import SNAPSHOT_PATH
from backend.scripts import fetch_weather

log = logging.getLogger("groundwork.weather_refresh")


def refresh_once(target: Path = SNAPSHOT_PATH) -> bool:
    fd, tmp_name = tempfile.mkstemp(prefix=".weather-", suffix=".json", dir=target.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    original = fetch_weather.SNAPSHOT_PATH
    fetch_weather.SNAPSHOT_PATH = tmp
    try:
        fetch_weather.main()
        snapshot = json.loads(tmp.read_text(encoding="utf-8"))
        if not snapshot.get("sites"):
            raise RuntimeError("refresh returned no sites")
        os.replace(tmp, target)
        log.info("weather snapshot refreshed: %d sites, fetched_at %s", len(snapshot["sites"]), snapshot["fetched_at"])
        return True
    except Exception as exc:  # keep serving the previous snapshot
        log.warning("weather refresh failed, keeping the previous snapshot: %s: %s", type(exc).__name__, exc)
        return False
    finally:
        fetch_weather.SNAPSHOT_PATH = original
        tmp.unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every-hours", type=float, default=3.0, help="hours between refreshes (stale after 6)")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    while True:
        refresh_once()
        if a.once:
            return
        time.sleep(a.every_hours * 3600)


if __name__ == "__main__":
    main()
