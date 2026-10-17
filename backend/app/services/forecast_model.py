"""Learned STOP-WORK forecast (advisory): chance that a real NWS STOP-WORK-class alert covers a site tomorrow.

A logistic regression trained on three years of archived Open-Meteo forecasts and NWS alert history
(backend/ml/train.py). It runs beside the rule-based call and never changes a status: the rules in
hazard.py decide, the model adds a calibrated probability and the factors that pushed it up or down.

Pure Python at runtime (no numpy/scikit-learn): the trained weights live in backend/ml/stop_work_model_v1.json.
`features()` is the single feature definition, imported by the training script, so training and serving
cannot drift apart.
"""
import json
import math
from datetime import date
from functools import lru_cache
from pathlib import Path

from ..config import REPO_ROOT

MODEL_PATH = REPO_ROOT / "backend" / "ml" / "stop_work_model_v1.json"
INPUTS = ("rain_forecast", "gust_forecast", "apparent_temp", "rain_7d")

# Feature -> the plain-language factor it belongs to (contributions are summed per factor for display).
GROUPS = {
    "log_rain_forecast": "forecast rain",
    "rain_x_gust": "forecast rain",
    "gust_forecast": "forecast gusts",
    "apparent_temp": "feels-like heat",
    "heat_above_30": "feels-like heat",
    "log_rain_7d": "rain over the past week",
    "latitude": "location",
    "longitude": "location",
    "season_sin": "time of year",
    "season_cos": "time of year",
    "lat_x_season": "time of year",
    "lon_x_season": "time of year",
}


def features(values: dict, latitude: float, longitude: float, day: date) -> dict[str, float] | None:
    """Model inputs from the app's own weather values (metric, as stored). None if any input is missing:
    a missing forecast is never treated as calm weather."""
    if any(values.get(k) is None for k in INPUTS):
        return None
    rain, gust = float(values["rain_forecast"]), float(values["gust_forecast"])
    heat, rain_7d = float(values["apparent_temp"]), float(values["rain_7d"])
    angle = 2 * math.pi * day.timetuple().tm_yday / 365.25
    return {
        "log_rain_forecast": math.log1p(max(rain, 0.0)),
        "rain_x_gust": math.log1p(max(rain, 0.0)) * gust / 50,
        "gust_forecast": gust,
        "apparent_temp": heat,
        "heat_above_30": max(0.0, heat - 30),
        "log_rain_7d": math.log1p(max(rain_7d, 0.0)),
        "latitude": latitude,
        "longitude": longitude,
        "season_sin": math.sin(angle),
        "season_cos": math.cos(angle),
        "lat_x_season": (latitude - 35) / 10 * math.cos(angle),
        "lon_x_season": (longitude + 95) / 15 * math.cos(angle),
    }


@lru_cache(maxsize=1)
def load_model(path: Path = MODEL_PATH) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def predict(values: dict, latitude: float, longitude: float, day: date, model: dict | None = None) -> dict | None:
    """{"probability", "drivers", "model_version", ...} or None when the model or an input is unavailable."""
    model = model or load_model()
    x = features(values, latitude, longitude, day)
    if model is None or x is None:
        return None
    logit = model["intercept"]
    by_group: dict[str, float] = {}
    for name, mean, scale, coef in zip(model["features"], model["mean"], model["scale"], model["coef"]):
        c = coef * (x[name] - mean) / scale
        logit += c
        by_group[GROUPS[name]] = by_group.get(GROUPS[name], 0.0) + c
    p = 1 / (1 + math.exp(-logit))
    ranked = sorted(by_group.items(), key=lambda kv: abs(kv[1]), reverse=True)
    drivers = [f"{g} {'raises' if c > 0 else 'lowers'} the risk" for g, c in ranked[:3] if abs(c) >= 0.1]
    ev = model["evaluation"]
    return {
        "probability": round(p, 3),
        "base_rate": ev["test_base_rate"],
        "drivers": drivers,
        "model_version": model["version"],
        "test_roc_auc": ev["models"]["logistic_regression"]["roc_auc"],
        "note": "Advisory: learned from past NWS alerts. The rule-based call above decides the status.",
    }
