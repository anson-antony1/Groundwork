"""Build fixtures/storm_replay.json from Open-Meteo archive data: python -m backend.scripts.build_storm_replay_v1"""
import json
import time
import urllib.parse
import urllib.request

from backend.app.config import DEMO_SITE_ID, FIXTURES_DIR
from backend.app.services.hazard import assess
from backend.app.services.sites import load_sites

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
START, END, STORM_DAY = "2024-10-02", "2024-10-10", "2024-10-09"
SIM_ALERT = "Hurricane Warning (SIMULATED)"
SOURCE = ("Hurricane Milton, forecast day 2024-10-09 (landfall evening of Oct 9). Rain, gust and apparent-temperature "
          "values are real Open-Meteo archive data. The NWS hurricane warning is SIMULATED because historical alerts "
          "are not available from the live alerts API.")


def fetch_chunk(sites):
    q = urllib.parse.urlencode({
        "latitude": ",".join(str(s.latitude) for s in sites),
        "longitude": ",".join(str(s.longitude) for s in sites),
        "start_date": START, "end_date": END,
        "hourly": "precipitation,wind_gusts_10m,apparent_temperature",
        "timezone": "America/New_York",
    })
    with urllib.request.urlopen(f"{ARCHIVE}?{q}", timeout=60) as r:
        data = json.load(r)
    return data if isinstance(data, list) else [data]


def summarize(hourly):
    t = hourly["time"]
    def pick(key, day):
        return [v for ts, v in zip(t, hourly[key]) if v is not None and ((ts.startswith(STORM_DAY)) == day)
                and (day or ts < STORM_DAY)]
    storm_rain, storm_gust, storm_temp = pick("precipitation", True), pick("wind_gusts_10m", True), pick("apparent_temperature", True)
    prior_rain = pick("precipitation", False)
    return {
        "rain_forecast": round(sum(storm_rain), 1) if storm_rain else None,
        "gust_forecast": max(storm_gust) if storm_gust else None,
        "apparent_temp": max(storm_temp) if storm_temp else None,
        "rain_7d": round(sum(prior_rain), 1) if prior_rain else None,
    }


def main():
    sites = [s for s in load_sites() if s.id != DEMO_SITE_ID]
    out = {}
    for i in range(0, len(sites), 10):
        chunk = sites[i:i + 10]
        for site, loc in zip(chunk, fetch_chunk(chunk)):
            vals = summarize(loc["hourly"])
            a = assess(vals, [SIM_ALERT])
            out[site.id] = {**vals, "hazard_score": a.hazard_score, "weather_state": a.weather_state}
        time.sleep(1)
    path = FIXTURES_DIR / "storm_replay.json"
    path.write_text(json.dumps({"scenario_id": "milton-2024", "source": SOURCE, "storm_day": STORM_DAY,
                                "simulated_alert": SIM_ALERT, "sites": out}, indent=2) + "\n", encoding="utf-8")
    rains = [v["rain_forecast"] for v in out.values() if v["rain_forecast"] is not None]
    gusts = [v["gust_forecast"] for v in out.values() if v["gust_forecast"] is not None]
    print(f"wrote {path}: {len(out)}/{len(sites)} sites")
    if rains and gusts:
        print(f"storm-day rain mm: max {max(rains)}, gust km/h: max {max(gusts)}")


if __name__ == "__main__":
    main()
