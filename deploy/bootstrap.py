"""Background jobs for hosted Groundwork, started next to uvicorn by deploy/start.sh.

1. With GROUNDWORK_REFRESH_WEATHER=1: refresh the weather snapshot at boot (the committed one goes
   stale 6 h after it was fetched), then every 3 h while the instance is awake.
2. Once the API answers, generate one 6 PM briefing if none is saved, so /briefing isn't empty after
   a free-tier restart resets the database. Without GEMINI_API_KEY the backend writes its template.
"""
import os
import time

import httpx

from deploy.refresh_weather import REAL_SNAPSHOT, refresh

API = f"http://127.0.0.1:{os.environ.get('PORT', '8010')}/api/v1"
REFRESH_EVERY_S = 3 * 60 * 60


def log(message: str) -> None:
    print(f"[bootstrap] {message}", flush=True)


def refresh_weather() -> None:
    log("weather refreshed" if refresh(REAL_SNAPSHOT) else "weather refresh failed; serving the previous snapshot")


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


def seed_briefing() -> None:
    try:
        saved = httpx.get(f"{API}/briefings", params={"limit": 1}, timeout=15).json()
        if saved.get("data"):
            log("a briefing is already saved")
            return
        response = httpx.post(f"{API}/briefings/generate", timeout=90)  # Gemini takes about 20 s
        source = response.json().get("data", {}).get("narrative_source") if response.is_success else None
        log(f"seeded a briefing: HTTP {response.status_code}, narrative {source}")
    except (httpx.HTTPError, ValueError, AttributeError) as exc:
        log(f"could not seed a briefing: {exc!r}")


def main() -> None:
    weather = os.environ.get("GROUNDWORK_REFRESH_WEATHER") == "1"
    if weather:
        refresh_weather()  # before the briefing, so it is written from fresh weather
    if wait_for_api():
        seed_briefing()
    else:
        log("the API never answered /health")
    while weather:
        time.sleep(REFRESH_EVERY_S)
        refresh_weather()


if __name__ == "__main__":
    main()
