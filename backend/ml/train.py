"""Train and evaluate the STOP-WORK forecast model: python -m backend.ml.train

Reads backend/ml/data/stop_work_days_v1.csv.gz (build it with python -m backend.ml.build_dataset) and writes
  * backend/ml/stop_work_model_v1.json  - logistic-regression weights + evaluation (served by the API)
  * backend/ml/EVALUATION.md            - the evaluation report

Evaluation is a forward-in-time split: fit on 2023-07-01..2025-06-30, test on 2025-07-01..2026-06-30, a full
year the model never saw. Compared on the same test rows:
  * rule score     - the app's own weather hazard score (hazard.py sub-scores, alerts excluded because
                     tomorrow's alerts are what we are forecasting)
  * climatology    - how often this site had a STOP-WORK day in this calendar month during training
  * logistic regression (shipped: auditable, pure-Python at runtime, calibrated probabilities)
  * gradient boosting (not shipped: shows how much a black-box model would add)
Confidence intervals resample whole days (sites on the same day share one storm, so rows are not independent).
Training needs scikit-learn (backend/ml/requirements.txt); the API does not.
"""
import csv
import gzip
import json
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from backend.app.services.forecast_model import MODEL_PATH, features
from backend.app.services.hazard import HAZARD_POLICY, hazard_parts
from backend.ml.build_dataset import DATASET, WORK_HOURS

REPORT = Path(__file__).resolve().parent / "EVALUATION.md"
TRAIN_END, TEST_START = date(2025, 6, 30), date(2025, 7, 1)
TUNE_SPLIT = date(2025, 1, 1)   # C is chosen on train rows from here on, after fitting on the earlier ones
SEED = 7


def load() -> list[dict]:
    rows = []
    with gzip.open(DATASET, "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            vals = {k: (float(r[k]) if r[k] != "" else None)
                    for k in ("rain_forecast", "gust_forecast", "apparent_temp", "rain_7d")}
            d = date.fromisoformat(r["date"])
            lat, lon = float(r["latitude"]), float(r["longitude"])
            x = features(vals, lat, lon, d)
            if x is None:
                continue
            parts = hazard_parts(vals["rain_forecast"], vals["gust_forecast"], vals["apparent_temp"])
            rows.append({"site": r["site_id"], "fl": r["site_id"].startswith("SITE-"), "date": d, "x": x,
                         "rule": min(10.0, sum(parts.values())), "y": int(r["stop_work"]),
                         "events": r["stop_work_events"]})
    return rows


def matrix(rows: list[dict], names: list[str]) -> np.ndarray:
    return np.array([[r["x"][n] for n in names] for r in rows], dtype=float)


def scores(y: np.ndarray, p: np.ndarray, clim: np.ndarray | None = None) -> dict:
    out = {"roc_auc": round(float(roc_auc_score(y, p)), 3),
           "pr_auc": round(float(average_precision_score(y, p)), 3)}
    if p.min() >= 0 and p.max() <= 1:
        out["brier"] = round(float(brier_score_loss(y, p)), 4)
        if clim is not None:
            out["brier_skill_vs_climatology"] = round(1 - out["brier"] / float(brier_score_loss(y, clim)), 3)
    top = p >= np.quantile(p, 0.9)
    out["top_decile_capture"] = round(float(y[top].sum() / max(1, y.sum())), 3)
    return out


def day_bootstrap_auc(dates: np.ndarray, y: np.ndarray, preds: dict[str, np.ndarray], n: int = 200) -> dict:
    """95% intervals for ROC AUC, and for the model's AUC gain over the rule score, resampling whole days."""
    rng = np.random.default_rng(SEED)
    days = np.unique(dates)
    idx_by_day = {d: np.flatnonzero(dates == d) for d in days}
    draws: dict[str, list[float]] = {k: [] for k in preds}
    gains = []
    for _ in range(n):
        idx = np.concatenate([idx_by_day[d] for d in rng.choice(days, len(days))])
        if y[idx].min() == y[idx].max():
            continue
        a = {k: roc_auc_score(y[idx], p[idx]) for k, p in preds.items()}
        for k in preds:
            draws[k].append(a[k])
        gains.append(a["logistic_regression"] - a["rule_score"])
    ci = {k: [round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3)] for k, v in draws.items()}
    ci["gain_vs_rule"] = [round(float(np.percentile(gains, 2.5)), 3), round(float(np.percentile(gains, 97.5)), 3)]
    return ci


def calibration(y: np.ndarray, p: np.ndarray, bins: int = 8) -> list[dict]:
    edges = np.unique(np.quantile(p, np.linspace(0, 1, bins + 1)))
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p <= hi if hi == edges[-1] else p < hi)
        if m.any():
            out.append({"predicted": round(float(p[m].mean()), 3), "observed": round(float(y[m].mean()), 3),
                        "rows": int(m.sum())})
    return out


def fit_logreg(X: np.ndarray, y: np.ndarray, C: float):
    mean, scale = X.mean(axis=0), X.std(axis=0)
    scale[scale == 0] = 1.0
    m = LogisticRegression(C=C, max_iter=2000).fit((X - mean) / scale, y)
    return m, mean, scale


def main() -> None:
    rows = load()
    names = list(rows[0]["x"])
    train = [r for r in rows if r["date"] <= TRAIN_END]
    test = [r for r in rows if r["date"] >= TEST_START]
    Xtr, ytr = matrix(train, names), np.array([r["y"] for r in train])
    Xte, yte = matrix(test, names), np.array([r["y"] for r in test])
    print(f"{len(rows)} rows ({len(train)} train, {len(test)} test), {len(names)} features, "
          f"base rate train {ytr.mean():.3%}, test {yte.mean():.3%}")

    # Climatology: this site's STOP-WORK rate in this calendar month during training (smoothed toward the
    # all-site monthly rate, so a site with few days in a month does not get 0% or 100%).
    month_all: dict[int, list[int]] = {}
    site_month: dict[tuple, list[int]] = {}
    for r in train:
        month_all.setdefault(r["date"].month, []).append(r["y"])
        site_month.setdefault((r["site"], r["date"].month), []).append(r["y"])
    prior = {m: float(np.mean(v)) for m, v in month_all.items()}

    def clim(r):
        v = site_month.get((r["site"], r["date"].month), [])
        k = 10.0
        return (sum(v) + k * prior[r["date"].month]) / (len(v) + k)
    p_clim = np.array([clim(r) for r in test])

    # Choose C forward in time inside the training years, then refit on all of them.
    early = np.array([r["date"] < TUNE_SPLIT for r in train])
    best_c, best_ll = 1.0, None
    for C in (0.01, 0.1, 1.0, 10.0):
        m, mean, scale = fit_logreg(Xtr[early], ytr[early], C)
        p = m.predict_proba((Xtr[~early] - mean) / scale)[:, 1]
        ll = -np.mean(ytr[~early] * np.log(p + 1e-12) + (1 - ytr[~early]) * np.log(1 - p + 1e-12))
        if best_ll is None or ll < best_ll:
            best_c, best_ll = C, ll
    lr, mean, scale = fit_logreg(Xtr, ytr, best_c)
    p_lr = lr.predict_proba((Xte - mean) / scale)[:, 1]

    gb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, early_stopping=True,
                                        validation_fraction=0.15, random_state=SEED).fit(Xtr, ytr)
    p_gb = gb.predict_proba(Xte)[:, 1]
    p_rule = np.array([r["rule"] for r in test])

    models = {
        "rule_score": scores(yte, p_rule),
        "climatology": scores(yte, p_clim, p_clim),
        "logistic_regression": scores(yte, p_lr, p_clim),
        "gradient_boosting": scores(yte, p_gb, p_clim),
    }
    dates = np.array([r["date"].toordinal() for r in test])
    ci = day_bootstrap_auc(dates, yte, {"rule_score": p_rule, "logistic_regression": p_lr})

    # The rule's own calls, read as forecasts of a STOP-WORK alert tomorrow.
    rule_calls = {}
    for label, cut in (("CAUTION or worse (score >= 3.5)", HAZARD_POLICY["caution_from"]),
                       ("STOP WORK (score >= 6.5)", HAZARD_POLICY["stop_work_from"])):
        flag = p_rule >= cut
        rule_calls[label] = {"flagged_share": round(float(flag.mean()), 4),
                             "precision": round(float(yte[flag].mean()), 3) if flag.any() else None,
                             "recall": round(float(yte[flag].sum() / max(1, yte.sum())), 3)}
    # The model flagging the same number of site-days as the rule's CAUTION-or-worse call: like for like.
    k = int((p_rule >= HAZARD_POLICY["caution_from"]).sum())
    if k:
        top = np.argsort(-p_lr)[:k]
        rule_calls["Model, same number of flags as rule CAUTION"] = {
            "flagged_share": round(k / len(p_lr), 4), "precision": round(float(yte[top].mean()), 3),
            "recall": round(float(yte[top].sum() / max(1, yte.sum())), 3)}

    fl = np.array([r["fl"] for r in test])
    by_region = {name: {"rows": int(m.sum()), "base_rate": round(float(yte[m].mean()), 4),
                        "rule_score_auc": round(float(roc_auc_score(yte[m], p_rule[m])), 3),
                        "logistic_regression_auc": round(float(roc_auc_score(yte[m], p_lr[m])), 3)}
                 for name, m in (("Florida (60 sites)", fl), ("Other states (240 sites)", ~fl))}

    coefs = sorted(zip(names, lr.coef_[0]), key=lambda kv: abs(kv[1]), reverse=True)
    evaluation = {
        "train_period": f"2023-07-01..{TRAIN_END}", "test_period": f"{TEST_START}..2026-06-30",
        "train_rows": len(train), "test_rows": len(test), "sites": len({r['site'] for r in rows}),
        "train_base_rate": round(float(ytr.mean()), 4), "test_base_rate": round(float(yte.mean()), 4),
        "chosen_C": best_c, "models": models, "roc_auc_95ci_by_day": ci, "rule_calls": rule_calls,
        "by_region": by_region, "calibration_logistic_regression": calibration(yte, p_lr),
    }
    MODEL_PATH.write_text(json.dumps({
        "version": "stop_work_logreg_v1",
        "label": ("1 if an NWS alert the app's rule treats as STOP WORK (hazard_alerts_v1: thunderstorm, tornado, "
                  "hurricane, tropical storm, flash flood, flood warning, lightning) covered the site during "
                  f"{WORK_HOURS[0]:02d}:00-{WORK_HOURS[1]:02d}:00 local time"),
        "sources": ["Open-Meteo Historical Forecast API (archived model forecasts)",
                    "Iowa Environmental Mesonet NWS VTEC archive (alerts by point)"],
        "features": names, "mean": [round(float(v), 6) for v in mean], "scale": [round(float(v), 6) for v in scale],
        "coef": [round(float(v), 6) for v in lr.coef_[0]], "intercept": round(float(lr.intercept_[0]), 6),
        "evaluation": evaluation,
    }, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(report(evaluation, coefs), encoding="utf-8")
    print(json.dumps({"models": models, "ci": ci, "rule_calls": rule_calls, "by_region": by_region}, indent=2))
    print(f"wrote {MODEL_PATH} and {REPORT}")


def report(ev: dict, coefs: list) -> str:
    m = ev["models"]
    lines = [
        "# STOP-WORK forecast model: evaluation",
        "",
        "Generated by `python -m backend.ml.train`. Do not edit by hand.",
        "",
        "**Question:** at 6 PM, how likely is it that a real NWS alert of a STOP-WORK type (the same list the app's "
        "rules use) will cover this site during working hours tomorrow?",
        "",
        f"**Data:** {ev['sites']} field sites x 3 years of days. Inputs are Open-Meteo's *archived forecasts* "
        "(the same variables the live app uses: forecast rain, max gust, max feels-like temperature, 7-day rain), plus "
        "location and time of year. Labels are real NWS alerts from the Iowa Environmental Mesonet archive.",
        "",
        f"**Split:** trained on {ev['train_period']} ({ev['train_rows']:,} site-days), tested on {ev['test_period']} "
        f"({ev['test_rows']:,} site-days), a full year the model never saw. STOP-WORK days: "
        f"{ev['train_base_rate']:.1%} of training rows, {ev['test_base_rate']:.1%} of test rows.",
        "",
        "## Results on the held-out year",
        "",
        "| Model | ROC AUC | PR AUC | Brier | Brier skill vs climatology | Share of STOP-WORK days in its top 10% |",
        "|---|---|---|---|---|---|",
    ]
    names = {"rule_score": "Rule hazard score (current app)", "climatology": "Climatology (site x month)",
             "logistic_regression": "**Logistic regression (shipped)**", "gradient_boosting": "Gradient boosting (not shipped)"}
    for k, label in names.items():
        s = m[k]
        lines.append(f"| {label} | {s['roc_auc']} | {s['pr_auc']} | {s.get('brier', '-')} | "
                     f"{s.get('brier_skill_vs_climatology', '-')} | {s['top_decile_capture']:.0%} |")
    ci = ev["roc_auc_95ci_by_day"]
    lines += [
        "",
        f"95% intervals (resampling whole days): rule score AUC {ci['rule_score']}, logistic regression "
        f"{ci['logistic_regression']}, gain of the model over the rule score {ci['gain_vs_rule']}.",
        "",
        "PR AUC matters most here: STOP-WORK days are rare, so it shows how much of the model's \"high risk\" is real. "
        "A random guess scores the base rate.",
        "",
        "## The rule's own calls, read as forecasts",
        "",
        "| Call | Share of site-days flagged | Precision | Recall |",
        "|---|---|---|---|",
    ]
    for k, v in ev["rule_calls"].items():
        lines.append(f"| {k} | {v['flagged_share']:.1%} | {v['precision']} | {v['recall']} |")
    lines += ["", "## By region", "", "| Region | Test rows | Base rate | Rule AUC | Model AUC |", "|---|---|---|---|---|"]
    for k, v in ev["by_region"].items():
        lines.append(f"| {k} | {v['rows']:,} | {v['base_rate']:.1%} | {v['rule_score_auc']} | {v['logistic_regression_auc']} |")
    lines += ["", "## Calibration (logistic regression, test year)", "", "| Mean predicted | Observed rate | Rows |", "|---|---|---|"]
    for b in ev["calibration_logistic_regression"]:
        lines.append(f"| {b['predicted']:.1%} | {b['observed']:.1%} | {b['rows']:,} |")
    lines += ["", "## Weights (standardized inputs; positive raises the risk)", "", "| Feature | Weight |", "|---|---|"]
    lines += [f"| `{n}` | {c:+.3f} |" for n, c in coefs]
    lines += [
        "",
        "## Design choices and limits",
        "",
        "- **Why logistic regression ships, not gradient boosting:** every prediction can be explained as a sum of "
        "named factors (shown in the app as \"what raised the risk\"), it runs in pure Python inside the API with no new "
        "dependency, and its probabilities are calibrated without extra steps. The table above shows what the "
        "black-box model would add.",
        "- **Advisory only.** The model never changes a status. Deterministic rules decide STOP WORK, so a missed "
        "forecast cannot silently clear a site.",
        "- **The label is \"an alert was issued\", not \"work was unsafe\".** Tornado and severe-thunderstorm "
        "*watches* count because the app's rule stops work for them. Alerts cover whole counties or polygons, so a "
        "site can be labeled STOP WORK on a day its own weather was fine.",
        "- **Archived forecasts are short-range.** Open-Meteo's historical forecasts are stitched from each model "
        "run's first hours, so they are somewhat more accurate than a real next-day forecast. Expect live "
        "performance a little below these numbers.",
        "- **Calibration drifts with the year.** The test year had fewer STOP-WORK days than the training years "
        f"({ev['test_base_rate']:.1%} vs {ev['train_base_rate']:.1%}), so mid-range probabilities read high; the top "
        "bin is close. Retraining each season, or recalibrating on the latest months, would fix most of it.",
        "- **Florida is the exception.** There the model does not beat the rule score (see By region): summer "
        "thunderstorms hit almost every afternoon, and the four daily inputs cannot tell which afternoon. CAPE would help most.",
        "- **The Hurricane Milton replay day (2024-10-09) is inside the training years**, so the app's replay shows an "
        "in-sample prediction. The fair test is the held-out year above.",
        "- **Sites are not a random sample** (OpenStreetMap substations, about 5 per state), and nearby sites share "
        "storms, so the confidence intervals resample days, not rows.",
        "- **Next inputs to try:** CAPE (thunderstorm energy) and precipitation hours from the same API would likely "
        "lift accuracy most, at the cost of a wider live snapshot.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
