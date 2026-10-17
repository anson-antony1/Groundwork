"""Optional ML hazard forecast (Sperry brief item 6), shown beside the rule-based 0-10 score.

Inference only, in plain Python, from a model file the training side writes:
policies/ml_hazard_model_v1.json =
    {"name": str, "trained_on": str, "features": [observation variable names], "means": [...],
     "scales": [...], "coef": [...], "intercept": float, "metrics": {"auc": float, ...}}
index = 10 * sigmoid(intercept + sum(coef_i * (x_i - mean_i) / scale_i)), a logistic model's predicted
chance of a severe weather event, on the same 0-10 scale. Advisory only: it never sets weather_state,
and STOP WORK stays with the rules and NWS alerts. No file (or a missing input) means no ML line.
"""
import json
import math

from ..config import REPO_ROOT

MODEL_PATH = REPO_ROOT / "policies" / "ml_hazard_model_v1.json"

_cache: tuple[float, dict] | None = None


def load_model() -> dict | None:
    global _cache
    if not MODEL_PATH.exists():
        return None
    mtime = MODEL_PATH.stat().st_mtime
    if _cache is None or _cache[0] != mtime:
        _cache = (mtime, json.loads(MODEL_PATH.read_text(encoding="utf-8")))
    return _cache[1]


def predict(values: dict, model: dict) -> float | None:
    xs = [values.get(f) for f in model["features"]]
    if any(x is None for x in xs):
        return None
    z = model["intercept"] + sum(c * (x - m) / (s or 1.0)
                                 for c, x, m, s in zip(model["coef"], xs, model["means"], model["scales"]))
    return round(10 / (1 + math.exp(-z)), 1)


def explain(status) -> str | None:
    model = load_model()
    if not model:
        return None
    score = predict({o["variable"]: o["value"] for o in status.observations}, model)
    if score is None:
        return None
    auc = (model.get("metrics") or {}).get("auc")
    quality = f", test AUC {auc:.2f}" if isinstance(auc, (int, float)) else ""
    return (f"ML forecast: {score:.1f}/10 ({model.get('name', 'prototype model')}, trained on "
            f"{model.get('trained_on', 'historical data')}{quality}). Advisory; the rules above decide STOP WORK.")
