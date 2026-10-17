"""Hosted weather refresh, v2: never trade a complete snapshot for a worse one.

v1 swapped in whatever the latest fetch returned. From Render's servers about 1 in 10 NWS alert
checks fail, so on Oct 17 a refresh replaced Rithika's complete snapshot (0 sites missing alerts)
with one missing 31, and those sites read UNKNOWN until the next run. After each fetch, v2:

1. Retries the NWS alert check for every site whose check failed (paced, a few attempts each).
2. Carries over a value the new fetch is still missing from the previous snapshot, only when that
   value is recent enough to stay fresh until the next refresh lands (carry_max) and is for the same
   day. USDA soil is survey data and carries over at any age. A carried value keeps its own fetched_at.
3. Dates the snapshot by its oldest time-sensitive value, so the API's 6-hour staleness check
   (services/weather.py) judges it by its oldest data, never its newest.

Nothing is invented: a value missing from both snapshots stays missing, and the site stays UNKNOWN.
Like v1, a fetch that fails or returns no sites keeps the previous snapshot, and the file is swapped
atomically (os.replace) so a request never reads a half-written snapshot.

Render start command (Python service):
    python -m backend.scripts.refresh_weather_loop_v2 & uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
One refresh only:
    python -m backend.scripts.refresh_weather_loop_v2 --once
"""
import argparse
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from backend.app.core.clock import now_utc
from backend.app.services.sites import load_sites
from backend.app.services.weather import NWS_URL, SNAPSHOT_PATH, STALE_AFTER, USER_AGENT, parse_alerts
from backend.scripts import fetch_weather

log = logging.getLogger("groundwork.weather_refresh")

EVERY_HOURS = 3.0
RETRY_ATTEMPTS = 3
RETRY_PAUSE_S = 1.0  # NWS rate-limits bursts; one request per second recovers most failures
SURVEY_VARIABLES = {"usda_soil", "usda_clay_pct"}  # soil survey values do not age


def _ts(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


def carry_max(every_hours: float = EVERY_HOURS) -> timedelta:
    """Oldest value that keeps the snapshot fresh until the next refresh lands (30 min margin)."""
    return STALE_AFTER - timedelta(hours=every_hours) - timedelta(minutes=30)


def missing(snapshot: dict) -> int:
    return sum(o["value"] is None for obs in snapshot.get("sites", {}).values() for o in obs)


def retry_alerts(snapshot: dict, sites_by_id: dict, attempts: int = RETRY_ATTEMPTS,
                 pause: float = RETRY_PAUSE_S, client=None) -> int:
    """Re-run the NWS check for sites whose alert check failed. Returns how many recovered."""
    failed = [sid for sid, d in snapshot.get("details", {}).items()
              if d.get("alerts") is None and sid in sites_by_id and sid in snapshot.get("sites", {})]
    if not failed:
        return 0
    own_client = client is None
    if own_client:
        client = httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"})
    recovered = 0
    try:
        for sid in failed:
            site = sites_by_id[sid]
            for attempt in range(1, attempts + 1):
                time.sleep(pause)
                try:
                    r = client.get(NWS_URL, params={"point": f"{site.latitude},{site.longitude}"})
                    r.raise_for_status()
                    events = parse_alerts(r.json())
                except Exception:  # still missing; try again, then leave it missing
                    continue
                stamp = now_utc().isoformat()
                for o in snapshot["sites"][sid]:
                    if o["variable"] == "nws_alerts":
                        o.update(value=float(len(events)), quality="available", fetched_at=stamp)
                d = snapshot["details"][sid]
                d["alerts"] = events
                d["errors"] = [e for e in d.get("errors", []) if not e.startswith("nws:")]
                d.setdefault("notes", []).append(f"nws alerts recovered on retry {attempt}")
                recovered += 1
                break
    finally:
        if own_client:
            client.close()
    return recovered


def carry_over(new: dict, old: dict | None, now: datetime, max_age: timedelta) -> int:
    """Fill values still missing in `new` from `old` when recent enough. Returns how many were carried."""
    if not old:
        return 0
    carried = 0
    old_details = old.get("details") or {}
    for sid, obs in new.get("sites", {}).items():
        previous = {o["variable"]: o for o in old.get("sites", {}).get(sid, [])}
        for i, o in enumerate(obs):
            p = previous.get(o["variable"])
            if o["value"] is not None or p is None or p["value"] is None:
                continue
            if o["variable"] not in SURVEY_VARIABLES and (
                    now - _ts(p["fetched_at"]) > max_age or p["valid_at"] != o["valid_at"]):
                continue
            obs[i] = dict(p)
            carried += 1
            d_new = new.setdefault("details", {}).setdefault(sid, {})
            d_old = old_details.get(sid, {})
            if o["variable"] == "nws_alerts":
                d_new["alerts"] = d_old.get("alerts")
                d_new["errors"] = [e for e in d_new.get("errors", []) if not e.startswith("nws:")]
            elif o["variable"] == "usda_soil":
                d_new["drainage"] = d_old.get("drainage")
            d_new.setdefault("notes", []).append(f"{o['variable']} carried over from {p['fetched_at']}")
    return carried


def oldest_fetched_at(snapshot: dict) -> str:
    """The snapshot's age is its oldest time-sensitive value (survey soil excluded)."""
    stamps = [o["fetched_at"] for obs in snapshot.get("sites", {}).values() for o in obs
              if o["value"] is not None and o["variable"] not in SURVEY_VARIABLES]
    return min(stamps, key=_ts) if stamps else snapshot["fetched_at"]


def _read(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def refresh_once(target: Path = SNAPSHOT_PATH, every_hours: float = EVERY_HOURS, retry: bool = True) -> bool:
    fd, tmp_name = tempfile.mkstemp(prefix=".weather-", suffix=".json", dir=target.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    original = fetch_weather.SNAPSHOT_PATH
    fetch_weather.SNAPSHOT_PATH = tmp
    try:
        fetch_weather.main()
        new = json.loads(tmp.read_text(encoding="utf-8"))
        if not new.get("sites"):
            raise RuntimeError("refresh returned no sites")
        fetched_missing = missing(new)
        recovered = retry_alerts(new, {s.id: s for s in load_sites()}) if retry else 0
        carried = carry_over(new, _read(target), now_utc(), carry_max(every_hours))
        new["fetched_at"] = oldest_fetched_at(new)
        tmp.write_text(json.dumps(new, indent=2) + "\n", encoding="utf-8", newline="\n")
        os.replace(tmp, target)
        log.info("weather snapshot refreshed: %d sites; missing values %d fetched -> %d after %d NWS retries "
                 "recovered and %d carried over; dated %s", len(new["sites"]), fetched_missing, missing(new),
                 recovered, carried, new["fetched_at"])
        return True
    except Exception as exc:  # keep serving the previous snapshot
        log.warning("weather refresh failed, keeping the previous snapshot: %s: %s", type(exc).__name__, exc)
        return False
    finally:
        fetch_weather.SNAPSHOT_PATH = original
        tmp.unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every-hours", type=float, default=EVERY_HOURS, help="hours between refreshes (stale after 6)")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    while True:
        refresh_once(every_hours=a.every_hours)
        if a.once:
            return
        time.sleep(a.every_hours * 3600)


if __name__ == "__main__":
    main()
