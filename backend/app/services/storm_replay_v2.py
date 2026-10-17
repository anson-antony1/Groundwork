"""Per-site values for the active replay scenario, read from fixtures/."""
import json
from functools import lru_cache

from ..config import FIXTURES_DIR

SCENARIO_FILES = {"demo-storm": "storm_replay.json", "calm-day": "replay_calm.json"}
DEFAULT_SCENARIO = "demo-storm"


def scenario_file(scenario_id: str | None) -> str:
    """Unknown scenario ids fall back to the Milton fixture, as before."""
    return SCENARIO_FILES.get(scenario_id or DEFAULT_SCENARIO, SCENARIO_FILES[DEFAULT_SCENARIO])


@lru_cache(maxsize=4)
def _load(filename: str) -> dict | None:
    path = FIXTURES_DIR / filename
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def replay_site_v2(site_id: str, scenario_id: str | None = None) -> dict | None:
    data = _load(scenario_file(scenario_id))
    site = data["sites"].get(site_id) if data else None
    if not site:
        return None
    day = data.get("storm_day") or data.get("day")
    label = data.get("label") or data.get("scenario_id") or "replay"
    rain, gust = site.get("rain_forecast"), site.get("gust_forecast")
    alert = data.get("simulated_alert")
    notes = [f"REPLAY {label}, day {day} (rain, wind and temperature are real archived data)"]
    if rain is not None and gust is not None:
        notes.append(f"Forecast rain {rain} mm, gusts {gust} km/h")
    notes.append(f"Active alerts: {alert}" if alert
                 else "No alert assumed: historical NWS alerts are unavailable (SIMULATED assumption)")
    return {"hazard_score": site.get("hazard_score"), "weather_state": site.get("weather_state"),
            "explanation": tuple(notes), "alert_events": (alert,) if alert else ()}
