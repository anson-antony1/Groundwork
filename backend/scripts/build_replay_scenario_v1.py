"""Build a replay fixture from Open-Meteo archive data.
Try dates first:  python -m backend.scripts.build_replay_scenario_v1 --day 2024-07-15 --dry-run
Write the file:   python -m backend.scripts.build_replay_scenario_v1 --day 2024-07-15"""
import argparse
import json
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta

from backend.app.config import DEMO_SITE_ID, FIXTURES_DIR
from backend.app.services.hazard import assess
from backend.app.services.sites import load_sites

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"


def fetch_chunk(sites, start, end):
    q = urllib.parse.urlencode({
        "latitude": ",".join(str(s.latitude) for s in sites),
        "longitude": ",".join(str(s.longitude) for s in sites),
        "start_date": start, "end_date": end,
        "hourly": "precipitation,wind_gusts_10m,apparent_temperature",
        "timezone": "America/New_York",
    })
    with urllib.request.urlopen(f"{ARCHIVE}?{q}", timeout=60) as r:
        data = json.load(r)
    return data if isinstance(data, list) else [data]


def summarize(hourly, day):
    t = hourly["time"]
    on_day = lambda key: [v for ts, v in zip(t, hourly[key]) if v is not None and ts.startswith(day)]
    prior = [v for ts, v in zip(t, hourly["precipitation"]) if v is not None and ts < day]
    rain, gust, temp = on_day("precipitation"), on_day("wind_gusts_10m"), on_day("apparent_temperature")
    return {"rain_forecast": round(sum(rain), 1) if rain else None,
            "gust_forecast": max(gust) if gust else None,
            "apparent_temp": max(temp) if temp else None,
            "rain_7d": round(sum(prior), 1) if prior else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", required=True, help="YYYY-MM-DD, a past day")
    ap.add_argument("--label", default="Calm-day comparison")
    ap.add_argument("--out", default="replay_calm.json")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    start = (date.fromisoformat(a.day) - timedelta(days=7)).isoformat()
    sites = [s for s in load_sites() if s.id != DEMO_SITE_ID]
    out = {}
    for i in range(0, len(sites), 10):
        chunk = sites[i:i + 10]
        for site, loc in zip(chunk, fetch_chunk(chunk, start, a.day)):
            vals = summarize(loc["hourly"], a.day)
            r = assess(vals, [])
            out[site.id] = {**vals, "hazard_score": r.hazard_score, "weather_state": r.weather_state}
        time.sleep(1)
    states = Counter(v["weather_state"] for v in out.values())
    scores = [v["hazard_score"] for v in out.values() if v["hazard_score"] is not None]
    print(f"{a.day}: {len(out)}/{len(sites)} sites, states {dict(states)}")
    if scores:
        print(f"hazard score min {min(scores)}, max {max(scores)}")
    if len(states) == 1:
        print("NOTE: every site lands in the same state, so this day will not show contrast. Try another day.")
    if a.dry_run:
        return
    source = (f"Open-Meteo archive weather for {a.day} (rain, wind, temperature are real). Historical NWS alerts "
              "are unavailable, so no alert is assumed: this is a SIMULATED assumption, and a real alert that day would not show here.")
    path = FIXTURES_DIR / a.out
    path.write_text(json.dumps({"scenario_id": "calm-day", "label": a.label, "source": source, "day": a.day,
                                "simulated_alert": None, "sites": out}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
