"""Per-site values for the active replay scenario, read from fixtures/.

When the scenario has an archived-alerts file (backend/scripts/build_replay_alerts_v1.py), each site
is assessed with the real NWS alerts that covered it that day instead of the scenario's
simulated_alert, so the normal hazard rules decide STOP WORK.
"""
import json
from functools import lru_cache

from ..config import FIXTURES_DIR
from .hazard import assess

SCENARIO_FILES = {"demo-storm": "storm_replay.json", "calm-day": "replay_calm.json"}
DEFAULT_SCENARIO = "demo-storm"
# Real NWS alerts per scenario, keyed by scenario file.
ALERT_FILES = {"storm_replay.json": "storm_replay_alerts_v1.json", "replay_calm.json": "replay_calm_alerts_v1.json"}
WEATHER_KEYS = ("rain_forecast", "gust_forecast", "apparent_temp", "rain_7d")


def scenario_file(scenario_id: str | None) -> str:
    """Unknown scenario ids fall back to the Milton fixture, as before."""
    return SCENARIO_FILES.get(scenario_id or DEFAULT_SCENARIO, SCENARIO_FILES[DEFAULT_SCENARIO])


@lru_cache(maxsize=4)
def _load(filename: str) -> dict | None:
    path = FIXTURES_DIR / filename
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def archived_alerts(scenario_id: str | None) -> dict | None:
    return _load(ALERT_FILES[scenario_file(scenario_id)])


def scenario_source(scenario_id: str | None) -> str | None:
    """Source line for the replay screen; the archived-alerts file describes the real alerts it adds."""
    archived = archived_alerts(scenario_id)
    data = _load(scenario_file(scenario_id))
    return (archived or {}).get("scenario_source") or (data or {}).get("source")


def replay_inputs(site_id: str, scenario_id: str | None = None) -> dict | None:
    """Raw inputs behind a site's replay call: weather values, alert event names and alert details."""
    data = _load(scenario_file(scenario_id))
    site = data["sites"].get(site_id) if data else None
    if not site:
        return None
    values = {k: site.get(k) for k in WEATHER_KEYS}
    archived = archived_alerts(scenario_id)
    if archived and site_id in archived["sites"]:
        details = [archived["events"][k] for k in archived["sites"][site_id]]
        alerts = [{"event": d["event"], "source": archived["source"]["name"], "onset": d.get("issued_at"),
                   "expires": d.get("expires_at"), "reference_url": d.get("source_url")} for d in details]
        return {"values": values, "events": [a["event"] for a in alerts], "alerts": alerts}
    alert = data.get("simulated_alert")
    alerts = [{"event": alert, "source": "SIMULATED (replay fixture)"}] if alert else []
    return {"values": values, "events": [alert] if alert else [], "alerts": alerts}


def replay_site_v2(site_id: str, scenario_id: str | None = None) -> dict | None:
    data = _load(scenario_file(scenario_id))
    site = data["sites"].get(site_id) if data else None
    if not site:
        return None
    day = data.get("storm_day") or data.get("day")
    label = data.get("label") or data.get("scenario_id") or "replay"
    rain, gust = site.get("rain_forecast"), site.get("gust_forecast")
    notes = [f"REPLAY {label}, day {day} (rain, wind and temperature are real archived data)"]
    if rain is not None and gust is not None:
        notes.append(f"Forecast rain {rain} mm, gusts {gust} km/h")

    archived = archived_alerts(scenario_id)
    if archived and site_id in archived["sites"]:
        events = list(dict.fromkeys(archived["events"][k]["event"] for k in archived["sites"][site_id]))
        result = assess({k: site.get(k) for k in WEATHER_KEYS}, events)
        notes.append(f"NWS alerts at this site that day (archived): {', '.join(events)}" if events
                     else "NWS alerts at this site that day (archived): none")
        notes.extend(n for n in result.explanation if n.startswith("Sub-scores"))
        return {"hazard_score": result.hazard_score, "weather_state": result.weather_state,
                "explanation": tuple(notes), "alert_events": result.alert_events}

    alert = data.get("simulated_alert")
    notes.append(f"Active alerts: {alert}" if alert
                 else "No alert assumed: historical NWS alerts are unavailable (SIMULATED assumption)")
    return {"hazard_score": site.get("hazard_score"), "weather_state": site.get("weather_state"),
            "explanation": tuple(notes), "alert_events": (alert,) if alert else ()}
