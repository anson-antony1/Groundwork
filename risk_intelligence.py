"""risk_intelligence.py

Turns Rishi's per-site output (hazard score, verdict, alerts, mats, data-quality
flags) into a structured plan for tomorrow: ranked sites, uncertainty summary,
deduplicated warnings, and staging totals.

It never recomputes the hazard score and never invents numbers - everything in
the plan comes from the input JSON or simple arithmetic on it.

ASSUMPTIONS (confirm with Rishi):
  * hazard_score is 0-10, HIGHER = MORE HAZARDOUS
  * verdict is one of "GO", "CAUTION", "NO-GO"
  * optional per-site "scenarios": [{"label", "hazard_score", "verdict"}, ...]
    (e.g. low / forecast / high rainfall) used to express uncertainty
"""
from __future__ import annotations

from typing import Any

VERDICT_SEVERITY = {"NO-GO": 2, "CAUTION": 1, "GO": 0}


def summarize_uncertainty(site: dict[str, Any]) -> dict[str, Any]:
    scenarios = site.get("scenarios") or []
    scores = [s["hazard_score"] for s in scenarios if "hazard_score" in s]
    if not scores:
        return {"has_scenarios": False, "uncertain": False}
    verdicts = sorted({s["verdict"] for s in scenarios if s.get("verdict")},
                      key=lambda v: VERDICT_SEVERITY.get(v, -1))
    low, high = min(scores), max(scores)
    return {
        "has_scenarios": True,
        "score_low": low,
        "score_high": high,
        "verdict_range": verdicts,
        "verdict_could_change": len(verdicts) > 1,
        # flag only when the verdict itself could change; wide score spreads alone are normal in storms
        "uncertain": len(verdicts) > 1,
    }


def _rank_key(site: dict[str, Any]):
    # most at-risk first
    return (-VERDICT_SEVERITY.get(site.get("verdict"), 0), -float(site.get("hazard_score", 0)))


def build_plan(data: dict[str, Any]) -> dict[str, Any]:
    sites = data.get("sites", [])
    ranked = []
    for i, site in enumerate(sorted(sites, key=_rank_key), start=1):
        ranked.append({
            "rank": i,
            "id": site.get("id"),
            "name": site.get("name"),
            "hazard_score": site.get("hazard_score"),
            "verdict": site.get("verdict"),
            "contributing_factors": site.get("contributing_factors", []),
            "weather_alerts": site.get("weather_alerts", []),
            "mat_estimate": site.get("mat_estimate", {}),
            "data_quality_flags": site.get("data_quality_flags", []),
            "uncertainty": summarize_uncertainty(site),
        })

    counts = {"GO": 0, "CAUTION": 0, "NO-GO": 0}
    for s in ranked:
        if s["verdict"] in counts:
            counts[s["verdict"]] += 1

    warnings = [{"site": s["name"], "alert": a} for s in ranked for a in s["weather_alerts"]]
    data_quality = [{"site": s["name"], "flag": f} for s in ranked for f in s["data_quality_flags"]]
    uncertain_sites = [s["name"] for s in ranked if s["uncertainty"]["uncertain"]]

    staging = {
        # only sites that will actually be visited (GO/CAUTION); NO-GO sites are held, so no staging
        "total_mats": sum(int(s["mat_estimate"].get("mats", 0) or 0) for s in ranked if s["verdict"] != "NO-GO"),
        "by_site": [
            {"site": s["name"], "mats": s["mat_estimate"].get("mats", 0),
             "vehicle": s["mat_estimate"].get("vehicle")}
            for s in ranked if s["verdict"] != "NO-GO"
        ],
    }

    return {
        "is_demo": bool(data.get("is_demo", False)),
        "what_if": data.get("what_if"),
        "generated_at": data.get("generated_at"),
        "target_date": data.get("target_date"),
        "site_count": len(ranked),
        "verdict_counts": counts,
        "sites_ranked": ranked,
        "warnings": warnings,
        "uncertain_sites": uncertain_sites,
        "data_quality": data_quality,
        "staging": staging,
    }
