"""Weather hazard score, weather state and per-vehicle ground access (README P3-P7).

Pure functions, no I/O. Rules:
  * Weather hazard (0-10) uses forecast rain, gusts and heat only. Vehicle and soil never change it (P7).
  * Active thunderstorm/flood-warning alerts force STOP_WORK. No averaging (P4/P5).
  * Missing data is UNKNOWN, never zero risk (P3). A failed NWS check means weather cannot be declared safe.
  * Ground access uses ground-wetness indicators (recent rain, forecast rain, soil drainage, clay) and a
    per-vehicle policy. It is a preliminary screening call, NOT a measured soil bearing capacity.
All thresholds below are DEMO POLICY values, not validated against field data.
"""
from dataclasses import dataclass

HAZARD_POLICY = {
    "label": "DEMO POLICY - preliminary screening thresholds, not validated against field data or engineering limits",
    "rain_forecast_mm_for_max": 50.0, "rain_forecast_max_pts": 4.0,
    "gust_kmh_zero": 30.0, "gust_kmh_max": 80.0, "gust_max_pts": 3.0,
    "heat_c_zero": 32.0, "heat_c_max": 41.0, "heat_max_pts": 3.0,
    "caution_from": 3.5,
    "stop_work_from": 6.5,
    # NWS event names containing any of these force STOP_WORK. Any other active alert forces at least CAUTION.
    "stop_work_alert_terms": ("thunderstorm", "tornado", "hurricane", "tropical storm", "flash flood",
                              "flood warning", "lightning"),
    "ground": {
        "rain_7d_mm_for_max": 50.0, "rain_7d_max_pts": 4.0,
        "rain_forecast_mm_for_max": 25.0, "rain_forecast_max_pts": 2.0,
        "drainage_pts_per_rank": 0.75,   # rank 0 (well drained) .. 4 (very poorly drained)
        "clay_high_pct": 40.0, "clay_bonus": 1.0,
        "pickup": {"go_below": 5.0, "mats_below": 7.5},
        "heavy_truck": {"go_below": 3.5, "mats_below": 6.0},
    },
}

VEHICLES = ("pickup", "heavy_truck")


def _ramp(x: float, lo: float, hi: float, pts: float) -> float:
    return pts * max(0.0, min(1.0, (x - lo) / (hi - lo)))


def classify_alerts(events: list[str], policy: dict = HAZARD_POLICY) -> tuple[str, list[str]]:
    """Returns ('STOP_WORK' | 'CAUTION' | 'NONE', matching event names)."""
    terms = policy["stop_work_alert_terms"]
    stop = [e for e in events if any(t in e.lower() for t in terms)]
    if stop:
        return "STOP_WORK", stop
    return ("CAUTION", list(events)) if events else ("NONE", [])


def hazard_parts(rain_forecast_mm, gust_kmh, apparent_c, policy: dict = HAZARD_POLICY) -> dict[str, float] | None:
    if rain_forecast_mm is None or gust_kmh is None or apparent_c is None:
        return None
    p = policy
    return {
        "rain": _ramp(rain_forecast_mm, 0, p["rain_forecast_mm_for_max"], p["rain_forecast_max_pts"]),
        "wind": _ramp(gust_kmh, p["gust_kmh_zero"], p["gust_kmh_max"], p["gust_max_pts"]),
        "heat": _ramp(apparent_c, p["heat_c_zero"], p["heat_c_max"], p["heat_max_pts"]),
    }


def ground_wetness(rain_7d_mm, rain_forecast_mm, drainage_rank, clay_pct, policy: dict = HAZARD_POLICY) -> float | None:
    """0-10 ground-wetness index, or None if a required input is missing. Clay is optional (no bonus if absent)."""
    if rain_7d_mm is None or rain_forecast_mm is None or drainage_rank is None:
        return None
    g = policy["ground"]
    idx = (_ramp(rain_7d_mm, 0, g["rain_7d_mm_for_max"], g["rain_7d_max_pts"])
           + _ramp(rain_forecast_mm, 0, g["rain_forecast_mm_for_max"], g["rain_forecast_max_pts"])
           + drainage_rank * g["drainage_pts_per_rank"]
           + (g["clay_bonus"] if clay_pct is not None and clay_pct >= g["clay_high_pct"] else 0.0))
    return round(min(10.0, idx), 1)


def access_for(index: float | None, vehicle: str, policy: dict = HAZARD_POLICY) -> str:
    if index is None:
        return "UNKNOWN"
    limits = policy["ground"][vehicle]
    if index < limits["go_below"]:
        return "GO_FOR_REVIEW"
    if index < limits["mats_below"]:
        return "MATS_FOR_REVIEW"
    return "NO_GO_FOR_REVIEW"


@dataclass(frozen=True)
class Assessment:
    hazard_score: float | None
    weather_state: str
    access_call: dict[str, str]
    ground_wetness: float | None
    alert_events: tuple[str, ...]
    explanation: tuple[str, ...]


def assess(values: dict[str, float | None], events: list[str] | None, policy: dict = HAZARD_POLICY) -> Assessment:
    """values: {variable: number|None}. events: NWS event names, or None if the alert check failed/never ran."""
    notes: list[str] = []
    level, matched = classify_alerts(events, policy) if events is not None else (None, [])
    if events is None:
        notes.append("NWS alert check unavailable: weather cannot be declared safe")
    elif matched:
        notes.append(f"Active alerts: {', '.join(matched)}")

    parts = hazard_parts(values.get("rain_forecast"), values.get("gust_forecast"), values.get("apparent_temp"), policy)
    score = None
    if parts is None:
        notes.append("rain/gust/heat forecast missing: hazard score unavailable")
    elif events is not None:
        score = round(min(10.0, sum(parts.values())), 1)
        notes.append("Sub-scores: " + ", ".join(f"{k} {v:.1f}" for k, v in parts.items()))

    if level == "STOP_WORK":
        state = "STOP_WORK"
    elif events is None or score is None:
        state = "UNKNOWN"
    elif score >= policy["stop_work_from"]:
        state = "STOP_WORK"
    elif level == "CAUTION" or score >= policy["caution_from"]:
        state = "CAUTION"
    else:
        state = "NORMAL"

    rank = values.get("usda_soil")
    wet = ground_wetness(values.get("rain_7d"), values.get("rain_forecast"),
                         None if rank is None else int(rank), values.get("usda_clay_pct"), policy)
    if wet is None:
        notes.append("ground-wetness inputs missing (7-day rain, forecast rain or soil drainage): vehicle access UNKNOWN")
    return Assessment(
        hazard_score=score,
        weather_state=state,
        access_call={v: access_for(wet, v, policy) for v in VEHICLES},
        ground_wetness=wet,
        alert_events=tuple(matched if events is not None else ()),
        explanation=tuple(notes),
    )
