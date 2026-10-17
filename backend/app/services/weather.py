"""Open-Meteo forecast + NWS alerts + USDA soil connectors, with a snapshot cache.

Fetching happens offline via `python -m backend.scripts.fetch_weather`, which writes
fixtures/weather_snapshot.json. Requests only read that snapshot, so the API stays fast
and the demo works without network access (README P14).

A failed or empty NWS/USDA fetch is recorded as a *missing* observation (value null), never as
"no alerts" or "neutral soil" (README P3).
"""
import json
from datetime import datetime, timedelta

import httpx

from ..config import FIXTURES_DIR

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
REFERENCE_URL = "https://open-meteo.com/en/docs"
NWS_URL = "https://api.weather.gov/alerts/active"
NWS_REFERENCE = "https://www.weather.gov/documentation/services-web-api"
SDA_URL = "https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest"
SDA_REFERENCE = "https://sdmdataaccess.nrcs.usda.gov/"
USER_AGENT = "GroundWork-hackathon (contact: team)"  # NWS requires a User-Agent
SNAPSHOT_PATH = FIXTURES_DIR / "weather_snapshot.json"
STALE_AFTER = timedelta(hours=6)
BATCH_SIZE = 25  # Open-Meteo accepts comma-separated coordinate lists
PAST_DAYS = 7    # daily arrays: [7 past days, today, tomorrow]
TOMORROW = PAST_DAYS + 1

# NRCS drainage class -> wetness rank (0 = drains freely, 4 = very poorly drained). Unknown names raise.
DRAINAGE_RANK = {
    "excessively drained": 0, "somewhat excessively drained": 0, "well drained": 0,
    "moderately well drained": 1, "somewhat poorly drained": 2, "poorly drained": 3, "very poorly drained": 4,
}

_cache: tuple[float, dict] | None = None


def _observation(variable: str, value, unit: str, kind: str, valid_at: str, fetched_at: str,
                 source: str = "Open-Meteo", reference_url: str = REFERENCE_URL) -> dict:
    return {
        "variable": variable,
        "value": value,
        "unit": unit,
        "source": source,
        "kind": kind,
        "valid_at": valid_at,
        "fetched_at": fetched_at,
        "quality": "available" if value is not None else "missing",
        "reference_url": reference_url,
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


def parse_alerts(payload: dict) -> list[str]:
    """NWS /alerts/active response -> event names. A response without 'features' raises (never reads as 'no alerts')."""
    return [f["properties"]["event"] for f in payload["features"]]


def parse_soil(payload: dict) -> tuple[str, float | None]:
    """USDA SDA response -> (drainage class, clay %). Raises if there is no row or an unknown drainage class."""
    rows = payload.get("Table")
    if not rows:
        raise ValueError("no USDA soil rows at this point (urban land, water or no survey): soil UNKNOWN")
    row = rows[0]
    drainage = (row[0] or "").strip().lower()
    if drainage not in DRAINAGE_RANK:
        raise ValueError(f"unrecognized or empty drainage class {drainage!r}")
    clay = float(row[1]) if row[1] not in (None, "") else None
    return drainage, clay


def _soil_sql(lat: float, lon: float) -> str:
    return ("SELECT TOP 1 c.drainagecl, ch.claytotal_r FROM component c LEFT JOIN chorizon ch ON c.cokey=ch.cokey AND ch.hzdept_r=0 "
            "WHERE c.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(%s %s)')) "
            "AND c.majcompflag='Yes' AND c.drainagecl IS NOT NULL ORDER BY c.comppct_r DESC" % (float(lon), float(lat)))


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


def fetch_alerts_and_soil(sites: list, fetched_at: datetime) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    """Per site: NWS alerts + USDA soil. Returns ({site_id: observations}, {site_id: details}).

    details = {"alerts": [event names] | None, "drainage": str | None, "errors": [str]}.
    Any failure leaves that value null and is listed in "errors".
    """
    stamp, day = fetched_at.isoformat(), fetched_at.date().isoformat()
    observations: dict[str, list[dict]] = {}
    details: dict[str, dict] = {}
    with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"}) as client:
        for s in sites:
            events, drainage, clay, errors = None, None, None, []
            try:
                r = client.get(NWS_URL, params={"point": f"{s.latitude},{s.longitude}"})
                r.raise_for_status()
                events = parse_alerts(r.json())
            except Exception as e:  # recorded as missing, never as "no alerts"
                errors.append(f"nws: {type(e).__name__}: {e}")
            try:
                r = client.post(SDA_URL, json={"query": _soil_sql(s.latitude, s.longitude), "format": "JSON"})
                r.raise_for_status()
                drainage, clay = parse_soil(r.json())
            except Exception as e:
                errors.append(f"usda: {type(e).__name__}: {e}")
            observations[s.id] = [
                _observation("nws_alerts", None if events is None else float(len(events)), "count", "observed", day, stamp,
                             "NWS", NWS_REFERENCE),
                _observation("usda_soil", None if drainage is None else float(DRAINAGE_RANK[drainage]),
                             "drainage wetness rank 0-4", "survey", day, stamp, "USDA NRCS Soil Data Access", SDA_REFERENCE),
                _observation("usda_clay_pct", clay, "%", "survey", day, stamp, "USDA NRCS Soil Data Access", SDA_REFERENCE),
            ]
            details[s.id] = {"alerts": events, "drainage": drainage, "errors": errors}
    return observations, details


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


def details_for(site_id: str) -> dict | None:
    """Alert names / soil class for a site, or None if the snapshot predates the NWS/USDA connectors."""
    snap = load_snapshot()
    return None if snap is None else snap.get("details", {}).get(site_id)
