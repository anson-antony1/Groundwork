"""Open-Meteo forecast connector + snapshot cache.

Fetching happens offline via `python -m backend.scripts.fetch_weather`, which writes
fixtures/weather_snapshot.json. Requests only read that snapshot, so the API stays fast
and the demo works without network access (README P14).
"""
import json
from datetime import datetime, timedelta

import httpx

from ..config import FIXTURES_DIR

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
REFERENCE_URL = "https://open-meteo.com/en/docs"
SNAPSHOT_PATH = FIXTURES_DIR / "weather_snapshot.json"
STALE_AFTER = timedelta(hours=6)
BATCH_SIZE = 25  # Open-Meteo accepts comma-separated coordinate lists
PAST_DAYS = 7    # daily arrays: [7 past days, today, tomorrow]
TOMORROW = PAST_DAYS + 1

_cache: tuple[float, dict] | None = None


def _observation(variable: str, value, unit: str, kind: str, valid_at: str, fetched_at: str) -> dict:
    return {
        "variable": variable,
        "value": value,
        "unit": unit,
        "source": "Open-Meteo",
        "kind": kind,
        "valid_at": valid_at,
        "fetched_at": fetched_at,
        "quality": "available" if value is not None else "missing",
        "reference_url": REFERENCE_URL,
    }


def parse_location(payload: dict, fetched_at: str) -> list[dict]:
    """One Open-Meteo location response -> README-style observations (value may be null)."""
    daily, units = payload["daily"], payload["daily_units"]
    past_rain = daily["precipitation_sum"][:PAST_DAYS]
    rain_7d = None if any(v is None for v in past_rain) else round(sum(past_rain), 1)
    day = daily["time"][TOMORROW]
    return [
        _observation("rain_7d", rain_7d, units["precipitation_sum"], "modeled", daily["time"][PAST_DAYS - 1], fetched_at),
        _observation("rain_forecast", daily["precipitation_sum"][TOMORROW], units["precipitation_sum"], "forecast", day, fetched_at),
        _observation("gust_forecast", daily["wind_gusts_10m_max"][TOMORROW], units["wind_gusts_10m_max"], "forecast", day, fetched_at),
        _observation("apparent_temp", daily["apparent_temperature_max"][TOMORROW], units["apparent_temperature_max"], "forecast", day, fetched_at),
    ]


def fetch_observations(sites: list, fetched_at: datetime) -> dict[str, list[dict]]:
    """sites: objects with id/latitude/longitude. Returns {site_id: observations}."""
    stamp = fetched_at.isoformat()
    result: dict[str, list[dict]] = {}
    with httpx.Client(timeout=30) as client:
        for i in range(0, len(sites), BATCH_SIZE):
            batch = sites[i:i + BATCH_SIZE]
            resp = client.get(FORECAST_URL, params={
                "latitude": ",".join(str(s.latitude) for s in batch),
                "longitude": ",".join(str(s.longitude) for s in batch),
                "daily": "precipitation_sum,wind_gusts_10m_max,apparent_temperature_max",
                "past_days": PAST_DAYS,
                "forecast_days": 2,
                "timezone": "auto",
            })
            resp.raise_for_status()
            payloads = resp.json()
            payloads = payloads if isinstance(payloads, list) else [payloads]
            for site, payload in zip(batch, payloads):
                result[site.id] = parse_location(payload, stamp)
    return result


def load_snapshot() -> dict | None:
    """Snapshot file contents, re-read only when the file changes."""
    global _cache
    if not SNAPSHOT_PATH.exists():
        return None
    mtime = SNAPSHOT_PATH.stat().st_mtime
    if _cache is None or _cache[0] != mtime:
        _cache = (mtime, json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8")))
    return _cache[1]


def observations_for(site_id: str, now: datetime) -> tuple[list[dict], bool]:
    """Returns (observations, is_stale). Empty list if the site has no snapshot data."""
    snap = load_snapshot()
    if snap is None or site_id not in snap["sites"]:
        return [], False
    stale = now - datetime.fromisoformat(snap["fetched_at"]) > STALE_AFTER
    obs = snap["sites"][site_id]
    if stale:
        obs = [{**o, "quality": "stale" if o["value"] is not None else "missing"} for o in obs]
    return obs, stale
