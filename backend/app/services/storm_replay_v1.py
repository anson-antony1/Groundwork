"""Per-site values for the active storm replay, read from fixtures/storm_replay.json."""
import json
from functools import lru_cache

from ..config import FIXTURES_DIR


@lru_cache(maxsize=1)
def _load() -> dict | None:
    path = FIXTURES_DIR / "storm_replay.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def replay_site(site_id: str) -> dict | None:
    data = _load()
    site = data["sites"].get(site_id) if data else None
    if not site:
        return None
    rain, gust = site.get("rain_forecast"), site.get("gust_forecast")
    notes = [f"REPLAY of Hurricane Milton, forecast day {data['storm_day']} (rain and wind are real archived data)"]
    if rain is not None and gust is not None:
        notes.append(f"Forecast rain {rain} mm, gusts {gust} km/h")
    notes.append(f"Active alerts: {data['simulated_alert']}")
    return {"hazard_score": site.get("hazard_score"), "explanation": tuple(notes),
            "alert_events": (data["simulated_alert"],)}
