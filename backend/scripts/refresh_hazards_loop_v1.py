"""Keep fixtures/hazards_snapshot.json (wildfire + wildlife) fresh on a hosted backend.

Same pattern as refresh_weather_loop_v2: fetch into a temp file beside the target and swap it in
atomically, keeping the previous snapshot if the fetch fails, returns no sites, or comes back with more
missing values than a previous snapshot that is still fresh. The API marks hazard data stale after
12 hours (services/field_hazards.py), so refreshing every 3 hours leaves room for failures.

Render start command (with the weather loop):
    python -m backend.scripts.refresh_weather_loop_v2 & python -m backend.scripts.refresh_hazards_loop_v1 & uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
"""
import argparse
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

from backend.app.core.clock import now_utc
from backend.scripts import fetch_hazards_v1 as fetch

log = logging.getLogger("groundwork.hazards_refresh")
KEEP_PREVIOUS_FOR = timedelta(hours=6)


def missing(snap: dict) -> int:
    return sum(v.get(k) is None for v in snap.get("sites", {}).values() for k in ("wildfire", "wildlife"))


def refresh_once(target: Path = fetch.SNAPSHOT_PATH) -> bool:
    fd, tmp_name = tempfile.mkstemp(prefix=".hazards-", suffix=".json", dir=target.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        fetch.main(tmp)
        new = json.loads(tmp.read_text(encoding="utf-8"))
        if not new.get("sites"):
            raise RuntimeError("hazards fetch returned no sites")
        try:
            old = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            old = None
        if old and missing(new) > missing(old) and now_utc() - datetime.fromisoformat(old["fetched_at"]) < KEEP_PREVIOUS_FOR:
            log.warning("hazards fetch had %d missing values vs %d before; keeping the previous snapshot",
                        missing(new), missing(old))
            return False
        os.replace(tmp, target)
        log.info("hazards snapshot refreshed: %d sites, %d missing values, fetched_at %s",
                 len(new["sites"]), missing(new), new["fetched_at"])
        return True
    except Exception as exc:  # keep serving the previous snapshot
        log.warning("hazards refresh failed, keeping the previous snapshot: %s: %s", type(exc).__name__, exc)
        return False
    finally:
        tmp.unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every-hours", type=float, default=3.0)
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
