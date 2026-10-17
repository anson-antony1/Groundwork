"""Train the ML hazard forecast (Sperry PlanIT brief item 6). Writes policies/ml_hazard_model_v1.json.

Training needs pandas + scikit-learn; the API does not (services/ml_index.py runs the model in plain Python):
    uv venv .ml && uv pip install --python .ml/bin/python pandas scikit-learn httpx
    .ml/bin/python backend/scripts/train_hazard_model_v1.py --storm-dir DIR_WITH_StormEvents_details_csv_gz

Label: a site-day is severe when NOAA Storm Events records a located severe storm or flood event (Thunderstorm
Wind, Hail, Lightning, Tornado, Flash Flood, Flood, Heavy Rain) within 25 km of the site that local day.
Zone-wide events (heat, high wind, winter) carry no coordinates, so they are not labels: this model is about
storms and floods, not heat. Storm Events is a reporting database, so quiet rural places are under-reported.

Features: Open-Meteo historical weather for the day (precipitation, max gust, max apparent temperature) and the
7 days of precipitation ending two days before (the same window as the live rain_7d), i.e. the four values the
live system reads from tomorrow's forecast (rain_forecast, gust_forecast, apparent_temp, rain_7d). Training uses
reanalysis (what happened), so live skill also depends on forecast accuracy.

Split: train 2023-2024, test 2025, by time, never shuffled. Baseline: our rule-based hazard score
(services/hazard.py hazard_parts) on the same test days. The 0-10 index is the percentile of a day's predicted
risk among training site-days, so 7.8 means riskier than 78% of 2023-24 days; the probability is reported too.
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import sys
import time
from pathlib import Path

import httpx
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
from backend.app.services.hazard import hazard_parts  # noqa: E402  (the live rule-based score, as baseline)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
EVENT_TYPES = {"Thunderstorm Wind", "Hail", "Lightning", "Tornado", "Flash Flood", "Flood", "Heavy Rain"}
FEATURES = ["rain_forecast", "gust_forecast", "apparent_temp", "rain_7d"]
TRANSFORMS = ["log1p", "identity", "identity", "log1p"]
START, END = "2022-12-24", "2025-12-31"


def pick_sites(n: int) -> list[dict]:
    """Deterministic spread: a third from the Florida demo set, the rest from the nationwide set."""
    data = json.loads((REPO / "fixtures" / "sites_50.json").read_text())
    sites = data["sites"] if isinstance(data, dict) else data
    fl = sorted((s for s in sites if s["id"].startswith("SITE-")), key=lambda s: s["id"])
    us = sorted((s for s in sites if s["id"].startswith("US-")), key=lambda s: s["id"])
    n_fl = n // 3
    take = lambda xs, k: [xs[round(i * (len(xs) - 1) / max(k - 1, 1))] for i in range(k)]  # noqa: E731
    return take(fl, n_fl) + take(us, n - n_fl)


def fetch_history(site: dict, cache: Path, pause: float) -> pd.DataFrame:
    path = cache / f"{site['id']}.json"
    if not path.exists():
        params = {"latitude": site["latitude"], "longitude": site["longitude"], "start_date": START, "end_date": END,
                  "daily": "precipitation_sum,wind_gusts_10m_max,apparent_temperature_max", "timezone": "auto"}
        for attempt in range(6):
            r = httpx.get(ARCHIVE_URL, params=params, timeout=60)
            if r.status_code == 429:  # free-tier limit: wait and retry
                print(f"  rate limited on {site['id']}, waiting 65 s")
                time.sleep(65)
                continue
            r.raise_for_status()
            path.write_text(r.text)
            break
        else:
            raise RuntimeError(f"Open-Meteo kept rate-limiting {site['id']}")
        time.sleep(pause)
    d = json.loads(path.read_text())["daily"]
    df = pd.DataFrame({"date": pd.to_datetime(d["time"]), "rain": d["precipitation_sum"],
                       "gust": d["wind_gusts_10m_max"], "app_temp": d["apparent_temperature_max"]})
    # Live rain_7d is the 7 days ending yesterday, for a forecast of tomorrow: days D-8..D-2.
    df["rain_7d"] = df["rain"].shift(2).rolling(7).sum()
    df = df.rename(columns={"rain": "rain_forecast", "gust": "gust_forecast", "app_temp": "apparent_temp"})
    df["site_id"] = site["id"]
    return df[(df.date >= "2023-01-01") & (df.date <= "2025-12-31")]


def load_events(storm_dir: str) -> pd.DataFrame:
    cols = ["BEGIN_YEARMONTH", "BEGIN_DAY", "EVENT_TYPE", "BEGIN_LAT", "BEGIN_LON"]
    files = sorted(glob.glob(str(Path(storm_dir) / "StormEvents_details-*_d202[345]_*.csv.gz")))
    if len(files) != 3:
        raise SystemExit(f"need the 2023, 2024 and 2025 StormEvents details files in {storm_dir}, found {files}")
    ev = pd.concat(pd.read_csv(f, usecols=cols, compression="gzip", low_memory=False) for f in files)
    ev = ev[ev.EVENT_TYPE.isin(EVENT_TYPES) & ev.BEGIN_LAT.notna() & ev.BEGIN_LON.notna()]
    ev["date"] = pd.to_datetime(ev.BEGIN_YEARMONTH.astype(int).astype(str) + ev.BEGIN_DAY.astype(int).astype(str).str.zfill(2),
                                format="%Y%m%d")
    return ev[["date", "BEGIN_LAT", "BEGIN_LON", "EVENT_TYPE"]]


def label(df: pd.DataFrame, site: dict, ev: pd.DataFrame, radius_km: float) -> pd.DataFrame:
    lat, lon = math.radians(site["latitude"]), math.radians(site["longitude"])
    elat, elon = np.radians(ev.BEGIN_LAT.to_numpy()), np.radians(ev.BEGIN_LON.to_numpy())
    a = np.sin((elat - lat) / 2) ** 2 + np.cos(lat) * np.cos(elat) * np.sin((elon - lon) / 2) ** 2
    near = ev[6371.0 * 2 * np.arcsin(np.sqrt(a)) <= radius_km]
    df = df.copy()
    df["severe"] = df.date.isin(set(near.date)).astype(int)
    return df


def transform(X: np.ndarray) -> np.ndarray:
    X = X.astype(float).copy()
    for j, t in enumerate(TRANSFORMS):
        if t == "log1p":
            X[:, j] = np.log1p(np.clip(X[:, j], 0, None))
    return X


def rules_score(df: pd.DataFrame) -> np.ndarray:
    return np.array([sum(hazard_parts(r, g, t).values()) for r, g, t in
                     zip(df.rain_forecast, df.gust_forecast, df.apparent_temp)])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--storm-dir", required=True)
    ap.add_argument("--cache-dir", default=None, help="Open-Meteo history cache (default: <storm-dir>/../openmeteo)")
    ap.add_argument("--sites", type=int, default=60)
    ap.add_argument("--radius-km", type=float, default=25.0)
    ap.add_argument("--pause", type=float, default=8.0, help="seconds between Open-Meteo requests (free tier)")
    ap.add_argument("--out", default=str(REPO / "policies" / "ml_hazard_model_v1.json"))
    a = ap.parse_args()
    cache = Path(a.cache_dir or Path(a.storm_dir).parent / "openmeteo")
    cache.mkdir(parents=True, exist_ok=True)

    sites = pick_sites(a.sites)
    ev = load_events(a.storm_dir)
    print(f"{len(ev)} located storm/flood events 2023-2025; {len(sites)} sites")
    frames = []
    for i, s in enumerate(sites, 1):
        frames.append(label(fetch_history(s, cache, a.pause), s, ev, a.radius_km))
        if i % 10 == 0:
            print(f"  {i}/{len(sites)} sites")
    data = pd.concat(frames).dropna(subset=FEATURES)
    train, test = data[data.date.dt.year <= 2024], data[data.date.dt.year == 2025]

    Xtr, Xte = transform(train[FEATURES].to_numpy()), transform(test[FEATURES].to_numpy())
    means, scales = Xtr.mean(axis=0), Xtr.std(axis=0)
    model = LogisticRegression(max_iter=2000).fit((Xtr - means) / scales, train.severe)
    p = model.predict_proba((Xte - means) / scales)[:, 1]
    z_train = model.decision_function((Xtr - means) / scales)
    rules = rules_score(test)

    y = test.severe.to_numpy()
    top = p >= np.quantile(p, 0.95)
    metrics = {
        "test_year": 2025, "train_years": "2023-2024",
        "n_train": int(len(train)), "n_test": int(len(test)),
        "positives_train": int(train.severe.sum()), "positives_test": int(y.sum()),
        "base_rate_test": round(float(y.mean()), 4),
        "auc": round(float(roc_auc_score(y, p)), 3),
        "average_precision": round(float(average_precision_score(y, p)), 3),
        "rules_auc": round(float(roc_auc_score(y, rules)), 3),
        "rules_average_precision": round(float(average_precision_score(y, rules)), 3),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "brier_climatology": round(float(brier_score_loss(y, np.full_like(p, train.severe.mean()))), 4),
        "top5pct_hit_rate": round(float(y[top].mean()), 3),
        "top5pct_recall": round(float(y[top].sum() / max(y.sum(), 1)), 3),
    }
    # Is it more than "summer is stormy"? Season-only baseline, and skill within each month.
    month_rate = train.groupby(train.date.dt.month).severe.mean()
    season = test.date.dt.month.map(month_rate).to_numpy()
    metrics["season_only_auc"] = round(float(roc_auc_score(y, season)), 3)
    months = test.date.dt.month.to_numpy()
    within = [roc_auc_score(y[months == k], p[months == k]) for k in range(1, 13)
              if 0 < y[months == k].sum() < (months == k).sum()]
    metrics["within_month_auc_mean"] = round(float(np.mean(within)), 3)
    # Per group: the Florida demo set (SITE-*) and the nationwide set (US-*).
    groups = {}
    for name, mask in (("florida_demo_sites", test.site_id.str.startswith("SITE-").to_numpy()),
                       ("other_us_sites", test.site_id.str.startswith("US-").to_numpy())):
        groups[name] = {"n": int(mask.sum()), "events": int(y[mask].sum()),
                        "auc": round(float(roc_auc_score(y[mask], p[mask])), 3),
                        "rules_auc": round(float(roc_auc_score(y[mask], rules[mask])), 3)}
    metrics["by_group"] = groups
    out = {
        "name": "logistic regression v1",
        "trained_on": "NOAA Storm Events + Open-Meteo history, 2023-24",
        "label": f"located severe storm or flood event within {a.radius_km:g} km that day (NOAA Storm Events)",
        "features": FEATURES, "transforms": TRANSFORMS,
        "means": [round(float(m), 6) for m in means], "scales": [round(float(s), 6) for s in scales],
        "coef": [round(float(c), 6) for c in model.coef_[0]], "intercept": round(float(model.intercept_[0]), 6),
        "z_quantiles": [round(float(q), 6) for q in np.quantile(z_train, np.linspace(0, 1, 101))],
        "base_rate_train": round(float(train.severe.mean()), 4),
        "sites": [s["id"] for s in sites],
        "metrics": metrics,
        "notes": [
            "Advisory only: never sets STOP WORK; the rules and NWS alerts decide.",
            "Labels are reported storm/flood events with coordinates; heat, high wind and winter events are zone-wide "
            "and not included, and rural areas are under-reported.",
            "Trained on observed (reanalysis) weather; live inputs are forecasts, so live skill is lower.",
            f"{len(sites)} of 300 sites (Open-Meteo free-tier limits); time split, 2025 never seen in training.",
            "On the Florida demo sites the rule-based score ranks storm days better than this model (see by_group); "
            "nationwide the model is better. Another reason it stays advisory.",
        ],
    }
    Path(a.out).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print("coef (standardized):", dict(zip(FEATURES, out["coef"])))
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
