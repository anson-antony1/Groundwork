"""Optional ML hazard forecast (Sperry brief item 6), shown beside the rule-based 0-10 score.

Inference only, in plain Python, from the file scripts/train_hazard_model_v1.py writes:
policies/ml_hazard_model_v1.json =
    {"name", "trained_on", "label", "features": [observation variables], "transforms": ["log1p" | "identity"],
     "means", "scales", "coef", "intercept", "z_quantiles": [101 training-day risk scores], "metrics": {...}}
A logistic model gives the probability of the labelled event; the 0-10 index is that day's percentile among
training site-days (7.8 = riskier than 78% of them), because the event is rare and raw probabilities sit near 0.
Without z_quantiles the index is 10 x probability. Advisory only: it never sets weather_state, and STOP WORK
stays with the rules and NWS alerts. No file, or a missing input, means no ML line.
"""
import bisect
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


def _percentile(z: float, quantiles: list[float]) -> float:
    """Share of training days scoring at or below z, interpolated between the stored quantiles (0-1)."""
    i = bisect.bisect_right(quantiles, z)
    if i == 0:
        return 0.0
    if i == len(quantiles):
        return 1.0
    lo, hi = quantiles[i - 1], quantiles[i]
    frac = (z - lo) / (hi - lo) if hi > lo else 0.0
    return (i - 1 + frac) / (len(quantiles) - 1)


def predict(values: dict, model: dict) -> tuple[float, float] | None:
    """(index 0-10, probability) or None when an input is missing."""
    xs = [values.get(f) for f in model["features"]]
    if any(x is None for x in xs):
        return None
    transforms = model.get("transforms") or ["identity"] * len(xs)
    xs = [math.log1p(max(x, 0.0)) if t == "log1p" else x for x, t in zip(xs, transforms)]
    z = model["intercept"] + sum(c * (x - m) / (s or 1.0)
                                 for c, x, m, s in zip(model["coef"], xs, model["means"], model["scales"]))
    p = 1 / (1 + math.exp(-z))
    index = 10 * _percentile(z, model["z_quantiles"]) if model.get("z_quantiles") else 10 * p
    return round(index, 1), p


def explain(status) -> str | None:
    model = load_model()
    if not model:
        return None
    result = predict({o["variable"]: o["value"] for o in status.observations}, model)
    if result is None:
        return None
    index, p = result
    m = model.get("metrics") or {}
    group = (m.get("by_group") or {}).get("florida_demo_sites" if status.site.id.startswith("SITE-") else "other_us_sites")
    if group:  # this site's own region: on the Florida demo sites the rules rank storm days better
        where = "Florida demo sites" if status.site.id.startswith("SITE-") else "nationwide sites"
        skill = f", 2025 test AUC {group['auc']:.2f} vs {group['rules_auc']:.2f} for the rules on {where}"
    else:
        skill = f", test AUC {m['auc']:.2f}" if isinstance(m.get("auc"), (int, float)) else ""
        if isinstance(m.get("rules_auc"), (int, float)):
            skill += f" vs {m['rules_auc']:.2f} for the rules"
    rank = (f"riskier than {index * 10:.0f}% of past site-days; " if model.get("z_quantiles") else "")
    chance = "under 1%" if p < 0.01 else f"{p:.0%}"
    return (f"ML forecast: {index:.1f}/10 ({rank}{chance} chance of a {model.get('label', 'severe weather event')}; "
            f"{model.get('name', 'prototype model')}, trained on {model.get('trained_on', 'historical data')}{skill}). "
            "Advisory; the rules above decide STOP WORK.")
