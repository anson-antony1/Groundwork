"""build_sites_json.py - builds the sites JSON that briefing.py consumes.

  python build_sites_json.py sites.csv -o sites.json          # real data (needs internet)
  python build_sites_json.py sites_template.csv --offline     # fake weather, for testing the pipeline

CSV columns: id, name, lat, lon, [soft_ground_length_ft]

Data sources (all free, no key):
  * Open-Meteo   - rain forecast + soil moisture
  * USDA SDA     - soil drainage class + clay % (Soil Data Access)
  * NWS          - active weather alerts (US only)

The scoring rule below is a TRANSPARENT STARTER RULE - tune the constants with your
team. It is not a validated model.
"""
from __future__ import annotations

import argparse
import csv
import ssl
try:  # macOS python.org builds often lack root certs; certifi fixes that
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None
import json
import math
import random
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# ---------------- tunable rule constants ----------------
GO_BELOW, NOGO_FROM = 3.5, 6.5          # verdict thresholds on 0-10 score
RAIN_PTS_PER_INCH, RAIN_PTS_MAX = 2.0, 4.0
SOIL_MOIST_DRY, SOIL_MOIST_WET, SOIL_MOIST_PTS_MAX = 0.15, 0.45, 3.0
DRAINAGE_PTS = {"very poorly drained": 3, "poorly drained": 3, "somewhat poorly drained": 2,
                "moderately well drained": 1}
CLAY_HIGH_PCT, CLAY_BONUS = 40, 1
FLOOD_ALERT_BONUS = 2.0
MAT_LENGTH_FT = 8                        # one mat covers ~8 ft of access path (assumption)
MATS_MULT = {"GO": 0, "CAUTION": 1, "NO-GO": 2}
VEHICLE = {"GO": "standard bucket truck", "CAUTION": "4x4 bucket truck", "NO-GO": "tracked carrier"}
HEADERS = {"User-Agent": "AccessCall-hackathon (contact: team)"}
# --------------------------------------------------------


def _get_json(url, data=None, timeout=20):
    req = urllib.request.Request(url, data=data, headers={**HEADERS, **({"Content-Type": "application/json"} if data else {})})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return json.loads(r.read().decode())


def fetch_weather(lat, lon):
    q = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "timezone": "auto", "precipitation_unit": "inch",
        "daily": "precipitation_sum", "hourly": "soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm",
        "past_days": 3, "forecast_days": 3})
    j = _get_json("https://api.open-meteo.com/v1/forecast?" + q)
    tz = ZoneInfo(j["timezone"])
    tomorrow = (datetime.now(tz) + timedelta(days=1)).date().isoformat()
    days = j["daily"]["time"]
    rain_tomorrow = j["daily"]["precipitation_sum"][days.index(tomorrow)] or 0.0
    past3 = [p or 0.0 for t, p in zip(days, j["daily"]["precipitation_sum"]) if t < tomorrow][-3:]
    h = j["hourly"]
    layers = [("soil_moisture_0_to_1cm", 1), ("soil_moisture_1_to_3cm", 2),
              ("soil_moisture_3_to_9cm", 6), ("soil_moisture_9_to_27cm", 18)]  # (variable, thickness cm)
    vals = []
    for i, t_ in enumerate(h["time"]):
        if not t_.startswith(tomorrow):
            continue
        num = den = 0.0
        for var, thick in layers:
            v = h.get(var, [None] * len(h["time"]))[i]
            if v is not None:
                num += v * thick
                den += thick
        if den:
            vals.append(num / den)  # thickness-weighted mean over the top ~27 cm
    if not vals:
        raise ValueError("Open-Meteo returned no soil moisture for tomorrow (all null)")
    return {"target_date": tomorrow, "rain_in": float(rain_tomorrow), "rain_prev3_in": round(sum(past3), 2),
            "soil_moisture": sum(vals) / len(vals), "tz": j["timezone"]}


def fetch_soil(lat, lon):
    sql = ("SELECT TOP 1 c.drainagecl, ch.claytotal_r FROM component c JOIN chorizon ch ON c.cokey=ch.cokey "
           "WHERE c.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(%s %s)')) "
           "AND c.majcompflag='Yes' AND ch.hzdept_r=0 ORDER BY c.comppct_r DESC" % (lon, lat))
    j = _get_json("https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest",
                  json.dumps({"query": sql, "format": "JSON"}).encode())
    row = j["Table"][0]
    return {"drainage": (row[0] or "").lower(), "clay_pct": float(row[1]) if row[1] not in (None, "") else None}


def fetch_alerts(lat, lon):
    j = _get_json(f"https://api.weather.gov/alerts/active?point={lat},{lon}")
    return [f["properties"]["event"] + (f" until {f['properties']['ends'][:16]}" if f["properties"].get("ends") else "")
            for f in j.get("features", [])]


def score(rain_in, soil_moisture, soil, alerts):
    rain = min(RAIN_PTS_MAX, rain_in * RAIN_PTS_PER_INCH)
    frac = (soil_moisture - SOIL_MOIST_DRY) / (SOIL_MOIST_WET - SOIL_MOIST_DRY)
    moist = max(0.0, min(1.0, frac)) * SOIL_MOIST_PTS_MAX
    soil_pts = DRAINAGE_PTS.get(soil.get("drainage", ""), 1 if not soil else 0)
    if soil.get("clay_pct") and soil["clay_pct"] >= CLAY_HIGH_PCT:
        soil_pts += CLAY_BONUS
    soil_pts = min(3, soil_pts)
    flood = FLOOD_ALERT_BONUS if any("flood" in a.lower() for a in alerts) else 0.0
    return round(min(10.0, rain + moist + soil_pts + flood), 1)


def verdict(s):
    return "GO" if s < GO_BELOW else ("CAUTION" if s < NOGO_FROM else "NO-GO")


def build_site(row, offline=False, what_if=None):
    lat, lon = float(row["lat"]), float(row["lon"])
    flags = []
    if offline:
        rnd = random.Random(row["id"])
        w = {"target_date": (datetime.now() + timedelta(days=1)).date().isoformat(), "rain_in": round(rnd.uniform(0, 2.2), 2),
             "rain_prev3_in": round(rnd.uniform(0, 1.5), 2), "soil_moisture": round(rnd.uniform(0.12, 0.45), 2)}
        soil = {"drainage": rnd.choice(list(DRAINAGE_PTS) + ["well drained"]), "clay_pct": rnd.choice([10, 25, 45])}
        alerts = ["DEMO Flood Watch"] if w["rain_in"] > 1.8 else []
        flags.append("OFFLINE FAKE DATA")
    else:
        w = fetch_weather(lat, lon)  # failure here excludes the site (caller records it)
        try:
            soil = fetch_soil(lat, lon)
            if not soil["drainage"]:
                raise ValueError("empty drainage")
        except Exception:
            soil = {}
            flags.append("soil data unavailable; neutral soil assumed")
        try:
            alerts = fetch_alerts(lat, lon)
        except Exception:
            alerts = []
            flags.append("NWS alerts unavailable; check manually")

    if what_if is not None:
        w["rain_in"] = what_if
        flags.append(f"WHAT-IF: tomorrow's rain set to {what_if} in (simulation, not the forecast)")
    s = score(w["rain_in"], w["soil_moisture"], soil, alerts)
    v = verdict(s)
    scenarios = []
    for label, mult in (("low rain", 0.5), ("forecast", 1.0), ("high rain", 1.5)):
        sc = score(w["rain_in"] * mult, w["soil_moisture"], soil, alerts)
        scenarios.append({"label": label, "hazard_score": sc, "verdict": verdict(sc)})

    factors = [f"{w['rain_in']:.1f} in rain forecast", f"{w['rain_prev3_in']:.1f} in rain in prior 3 days",
               f"soil moisture {w['soil_moisture']:.2f}"]
    if soil.get("drainage"):
        factors.append(soil["drainage"])
    if soil.get("clay_pct") and soil["clay_pct"] >= CLAY_HIGH_PCT:
        factors.append(f"clay {soil['clay_pct']:.0f}%")
    length = float(row.get("soft_ground_length_ft") or 100)
    mats = math.ceil(length / MAT_LENGTH_FT) * MATS_MULT[v]
    return {"id": row["id"], "name": row["name"], "hazard_score": s, "verdict": v, "weather_alerts": alerts,
            "contributing_factors": factors, "mat_estimate": {"mats": mats, "vehicle": VEHICLE[v]},
            "data_quality_flags": flags, "scenarios": scenarios}, w["target_date"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", default="sites.json")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--what-if-rain-in", type=float, default=None,
                    help="SIMULATION: override tomorrow's rain (inches) at every site, e.g. 2.0")
    a = ap.parse_args()
    sites, failed, target = [], [], None
    with open(a.csv, newline="") as f:
        for row in csv.DictReader(f):
            try:
                site, target = build_site(row, a.offline, a.what_if_rain_in)
                sites.append(site)
            except Exception as e:
                failed.append({"id": row.get("id"), "name": row.get("name"), "error": str(e)})
                print(f"FAILED {row.get('id')}: {e}")
    out = {"is_demo": a.offline or any(s["id"].startswith("demo-") for s in sites),
           "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
           "target_date": target, "failed_sites": failed,
           "what_if": (f"SIMULATED SCENARIO: {a.what_if_rain_in} in of rain at every site (not a real forecast)"
                       if a.what_if_rain_in is not None else None), "sites": sites}
    with open(a.out, "w") as f:
        json.dump(out, f, indent=2)
    print(f"wrote {len(sites)} sites ({len(failed)} failed) -> {a.out}")


if __name__ == "__main__":
    main()
