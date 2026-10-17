"""Build the STOP-WORK forecast training set: python -m backend.ml.build_dataset

One row per (field site, day) from 2023-07-01 to 2026-06-30, shaped exactly like what the app knows at 6 PM
the evening before (services/weather.py):
  * features: Open-Meteo's archived forecast for that day (rain, max gust, max feels-like temperature) and
    the 7-day rain total ending the day before the forecast was made, plus where and when the site is;
  * label: 1 if a real NWS alert that the app's own rule treats as STOP WORK (hazard_alerts_v1, the same
    function the live API uses) was in effect at the site during working hours, 06:00-20:00 local time.

Sources:
  * Open-Meteo Historical Forecast API: the forecast models' own archived output, so the features carry the
    same biases as the live forecast instead of a reanalysis of what actually happened.
  * Iowa Environmental Mesonet VTEC archive, by point: every NWS watch, warning and advisory whose polygon
    or county/zone covered the site.

Raw responses are cached in backend/ml/cache/ (git-ignored), so a rerun only fetches what is missing.
  python -m backend.ml.build_dataset --limit 10     # quick check on 10 sites
"""
import argparse
import csv
import gzip
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from backend.app.config import DEMO_SITE_ID
from backend.app.services.hazard import HAZARD_POLICY
from backend.app.services.hazard_alerts_v1 import classify_alerts_v1
from backend.app.services.sites import load_sites

ML_DIR = Path(__file__).resolve().parent
CACHE = ML_DIR / "cache"
DATASET = ML_DIR / "data" / "stop_work_days_v1.csv.gz"

START, END = date(2023, 7, 1), date(2026, 6, 30)   # three full seasonal cycles
LOOKBACK = 8                                        # rain_7d needs the 7 days before "today" (= target - 1)
WORK_HOURS = (6, 20)                                # local hours a crew would be on site

OPEN_METEO = "https://historical-forecast-api.open-meteo.com/v1/forecast"
IEM = "https://mesonet.agron.iastate.edu/json/vtec_events_bypoint.py"
UA = {"User-Agent": "Groundwork-hackathon-ml/1.0"}

COLUMNS = ["site_id", "region", "latitude", "longitude", "date", "rain_forecast", "gust_forecast",
           "apparent_temp", "rain_7d", "stop_work", "stop_work_events"]


def _get_json(url: str, params: dict, cache_file: Path, retries: int = 4) -> dict:
    if cache_file.exists():
        return json.loads(cache_file.read_text())
    full = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(full, headers=UA), timeout=120) as r:
                data = json.loads(r.read())
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(data))
            return data
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def fetch_weather(site) -> dict:
    return _get_json(OPEN_METEO, {
        "latitude": site.latitude, "longitude": site.longitude,
        "start_date": (START - timedelta(days=LOOKBACK)).isoformat(), "end_date": END.isoformat(),
        "daily": "precipitation_sum,wind_gusts_10m_max,apparent_temperature_max", "timezone": "auto",
    }, CACHE / "open_meteo" / f"{site.id}.json")


def fetch_alerts(site) -> dict:
    time.sleep(0.3)  # IEM is a free university service; stay gentle
    return _get_json(IEM, {
        "lat": site.latitude, "lon": site.longitude,
        "sdate": (START - timedelta(days=1)).isoformat(), "edate": (END + timedelta(days=1)).isoformat(),
    }, CACHE / "iem" / f"{site.id}.json")


def _utc(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def stop_work_by_day(events: list[dict], utc_offset_s: int) -> dict[date, list[str]]:
    """Local day -> names of STOP-WORK-class alerts in effect during that day's working hours."""
    tz = timezone(timedelta(seconds=utc_offset_s))
    out: dict[date, list[str]] = {}
    for e in events:
        name, issue, expire = e.get("name"), e.get("issue"), e.get("expire")
        if not (name and issue and expire):
            continue
        if classify_alerts_v1([name], HAZARD_POLICY)[0] != "STOP_WORK":
            continue
        start, end = _utc(issue).astimezone(tz), _utc(expire).astimezone(tz)
        day = start.date()
        while day <= end.date():
            lo = datetime(day.year, day.month, day.day, WORK_HOURS[0], tzinfo=tz)
            hi = datetime(day.year, day.month, day.day, WORK_HOURS[1], tzinfo=tz)
            if start < hi and end > lo:
                names = out.setdefault(day, [])
                if name not in names:
                    names.append(name)
            day += timedelta(days=1)
    return out


def site_rows(site) -> list[dict]:
    weather, alerts = fetch_weather(site), fetch_alerts(site)
    daily = weather["daily"]
    by_date = {date.fromisoformat(t): i for i, t in enumerate(daily["time"])}
    labels = stop_work_by_day(alerts.get("events", []), weather.get("utc_offset_seconds", 0))
    rain, gust, heat = daily["precipitation_sum"], daily["wind_gusts_10m_max"], daily["apparent_temperature_max"]
    rows = []
    d = START
    while d <= END:
        i = by_date.get(d)
        past = [rain[j] for j in range(i - LOOKBACK, i - 1)] if i is not None and i >= LOOKBACK else [None]
        events = labels.get(d, [])
        rows.append({
            "site_id": site.id, "region": site.region, "latitude": site.latitude, "longitude": site.longitude,
            "date": d.isoformat(),
            "rain_forecast": None if i is None else rain[i],
            "gust_forecast": None if i is None else gust[i],
            "apparent_temp": None if i is None else heat[i],
            "rain_7d": None if any(v is None for v in past) else round(sum(past), 1),
            "stop_work": int(bool(events)), "stop_work_events": "|".join(events),
        })
        d += timedelta(days=1)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, help="only the first N field sites")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    sites = [s for s in load_sites() if s.id != DEMO_SITE_ID][: a.limit]
    rows, failed = [], []

    def work(site):
        try:
            return site.id, site_rows(site), None
        except Exception as e:  # one bad site must not sink the whole build
            return site.id, [], f"{type(e).__name__}: {e}"

    with ThreadPoolExecutor(a.workers) as pool:
        for n, (sid, site_r, err) in enumerate(pool.map(work, sites), start=1):
            rows.extend(site_r)
            if err:
                failed.append((sid, err))
            if n % 25 == 0 or n == len(sites):
                print(f"{n}/{len(sites)} sites, {len(rows)} rows, {len(failed)} failed", flush=True)

    DATASET.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(DATASET, "wt", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    positives = sum(r["stop_work"] for r in rows)
    print(f"wrote {DATASET}: {len(rows)} site-days from {len(sites) - len(failed)} sites, "
          f"{positives} STOP-WORK days ({positives / max(1, len(rows)):.1%})")
    for sid, err in failed:
        print(f"  FAILED {sid}: {err}")


if __name__ == "__main__":
    main()
