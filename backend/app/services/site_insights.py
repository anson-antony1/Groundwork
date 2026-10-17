"""Extra per-site detail for the frontend: hazard sub-scores, alert details and "Why this call?" reasons.

Derived only from inputs the hazard rules already use; nothing here changes a score or a status.
"""
from .hazard import HAZARD_POLICY, hazard_parts
from .units import rain_text, temp_text, wind_text

FLOOD_TERMS = ("flood",)
STORM_TERMS = ("thunderstorm", "tornado", "hurricane", "tropical storm", "lightning")
NWS_POINT_URL = "https://api.weather.gov/alerts/active?point={lat},{lon}"


def _alert_points(events: list[str] | None, terms: tuple[str, ...]) -> float | None:
    """Flood/storm are not points in the score: a matching alert forces STOP WORK instead.
    Reported as 10 when such an alert is active, 0 when the check ran and found none, None if it failed."""
    if events is None:
        return None
    return 10.0 if any(t in e.lower() for e in events for t in terms) else 0.0


def subscores(values: dict, events: list[str] | None) -> dict | None:
    parts = hazard_parts(values.get("rain_forecast"), values.get("gust_forecast"), values.get("apparent_temp"))
    if parts is None and events is None:
        return None
    part = (lambda k: round(parts[k], 1)) if parts else (lambda k: None)
    return {"rain": part("rain"), "wind": part("wind"), "heat": part("heat"),
            "flood": _alert_points(events, FLOOD_TERMS), "storm": _alert_points(events, STORM_TERMS)}


def live_alerts(events: list[str] | None, lat: float, lon: float) -> list[dict]:
    """The live snapshot stores event names only, so details link to the NWS lookup for this point."""
    url = NWS_POINT_URL.format(lat=lat, lon=lon)
    return [{"event": e, "source": "NWS api.weather.gov (live)", "reference_url": url} for e in events or []]


def weather_triggers(values: dict, events: list[str] | None) -> list[str]:
    triggers = [f"NWS alert: {e}" for e in events or []]
    if events is None:
        triggers.append("NWS alert check unavailable")
    parts = hazard_parts(values.get("rain_forecast"), values.get("gust_forecast"), values.get("apparent_temp"))
    if parts:
        if parts["rain"] > 0:
            triggers.append(f"Forecast rain {rain_text(values['rain_forecast'])}")
        if parts["wind"] > 0:
            triggers.append(f"Forecast gusts {wind_text(values['gust_forecast'])} "
                            f"(points from {wind_text(HAZARD_POLICY['gust_kmh_zero'])})")
        if parts["heat"] > 0:
            triggers.append(f"Feels-like {temp_text(values['apparent_temp'])} "
                            f"(points from {temp_text(HAZARD_POLICY['heat_c_zero'])})")
    return triggers
