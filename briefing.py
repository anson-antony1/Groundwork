"""briefing.py

Generates the 6 PM briefing.

  generate_briefing(data) -> {"text": str, "source": "gemini" | "fallback", "plan": dict, "note": str}

The deterministic fallback formatter ALWAYS works. Gemini only rewrites it into
nicer prose, and its output is rejected (falling back) if it contains any number
that isn't in the plan.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from risk_intelligence import build_plan

try:  # optional: .env for local dev
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

NUM_RE = re.compile(r"\d+(?:\.\d+)?")
GLUE_RE = re.compile(r"\b(for|and|to|at|of|in|by|on|with)(?=[A-Z][a-z])")  # Gemini sometimes drops the space: "forWindermere"
LEAK_RE = re.compile(r"\bN others\b|total_mats|remaining_sites_summary|sites_ranked|by_site|what_if|is_demo")


# ---------- deterministic fallback ----------
MAX_DETAIL = 10  # sites shown in detail; the rest are summarized


def remaining_summary(sites: list[dict[str, Any]]) -> dict[str, Any]:
    scores = [s["hazard_score"] for s in sites]
    verdicts: dict[str, int] = {}
    for s in sites:
        verdicts[s["verdict"]] = verdicts.get(s["verdict"], 0) + 1
    return {"count": len(sites), "hazard_min": min(scores), "hazard_max": max(scores), "verdicts": verdicts}


def format_fallback_briefing(plan: dict[str, Any], max_detail: int = MAX_DETAIL) -> str:
    c = plan["verdict_counts"]
    lines = []
    if plan["is_demo"]:
        lines.append("*** DEMO DATA - NOT REAL SITES ***")
    if plan.get("what_if"):
        lines.append(f"*** {plan['what_if']} ***")
    lines.append(f"6 PM BRIEFING - plan for {plan['target_date']}")
    lines.append(f"{plan['site_count']} sites: {c['NO-GO']} NO-GO, {c['CAUTION']} CAUTION, {c['GO']} GO")
    lines.append("")
    sites = plan["sites_ranked"]
    lines.append(f"Most at-risk sites (top {min(max_detail, len(sites))} of {len(sites)}):")
    for s in sites[:max_detail]:
        u = s["uncertainty"]
        line = f"{s['rank']}. {s['name']} - {s['verdict']} (hazard {s['hazard_score']}/10)"
        if s["contributing_factors"]:
            line += "; " + ", ".join(s["contributing_factors"])
        lines.append(line)
        if u.get("uncertain"):
            lines.append(f"   Uncertain: score ranges {u['score_low']}-{u['score_high']} across scenarios"
                         + (f"; verdict could be {' or '.join(u['verdict_range'])}" if u["verdict_could_change"] else ""))
    rest = sites[max_detail:]
    if rest:
        r = remaining_summary(rest)
        vs = ", ".join(f"{n} {v}" for v, n in r["verdicts"].items())
        lines.append(f"...plus {r['count']} lower-risk sites ({vs}), hazard {r['hazard_min']}-{r['hazard_max']}/10.")
    if plan["warnings"]:
        lines += ["", "Weather warnings:"]
        lines += [f"- {w['site']}: {w['alert']}" for w in plan["warnings"]]
    lines += ["", "Staging:"]
    need = [s for s in plan["staging"]["by_site"] if s["mats"]]
    if need:
        lines.append(f"- Total mats needed for non-NO-GO sites: {plan['staging']['total_mats']}")
        lines += [f"- {s['site']}: {s['mats']} mats, {s['vehicle']}" for s in need]
    else:
        lines.append("- No mats needed for GO/CAUTION sites; standard vehicles are fine.")
    if plan["data_quality"]:
        lines += ["", "Data-quality notes:"]
        lines += [f"- {d['site']}: {d['flag']}" for d in plan["data_quality"]]
    return "\n".join(lines)


def prompt_view(plan: dict[str, Any], n: int = 15) -> dict[str, Any]:
    """Trimmed copy of the plan sent to Gemini: top-n sites in full, the rest summarized."""
    view = {k: v for k, v in plan.items() if k != "sites_ranked"}
    view["sites_ranked"] = plan["sites_ranked"][:n]
    rest = plan["sites_ranked"][n:]
    if rest:
        view["remaining_sites_summary"] = remaining_summary(rest)
    return view


# ---------- guardrail ----------
def _numbers_in(obj: Any) -> set[str]:
    return set(NUM_RE.findall(json.dumps(obj)))


def numbers_are_grounded(text: str, plan: dict[str, Any]) -> tuple[bool, set[str]]:
    """True if every number in `text` appears in the plan (or is the 6 in '6 PM' / a rank)."""
    allowed = _numbers_in(plan) | {"6"} | {str(i) for i in range(1, plan["site_count"] + 1)}
    # normalize "8.0" vs "8"
    def norm(n: str) -> str:
        return n.rstrip("0").rstrip(".") if "." in n else n
    allowed_norm = {norm(a) for a in allowed}
    bad = {n for n in NUM_RE.findall(text) if norm(n) not in allowed_norm}
    return (not bad, bad)


# ---------- Gemini ----------
PROMPT = """You are writing a short 6 PM operations briefing for a utility dispatcher.
Use ONLY the facts in the JSON plan below. Do NOT invent sites, numbers, alerts, mat
counts, or vehicles. Keep every number exactly as given. Do not add numbers together or
compute new ones.
Structure: (1) one-line headline with the counts of NO-GO / CAUTION / GO sites;
(2) NO-GO sites: these are HELD, do not dispatch crews, and give no mat or vehicle advice for them;
(3) CAUTION sites and what to bring (mats and vehicle, from staging.by_site);
(4) uncertainty and data-quality notes.
Name at most 5 sites per section, then say "and others" (no number, and never write a placeholder like N).
Never mention JSON field names (such as total_mats, remaining_sites_summary, staging, sites_ranked); describe things in plain English. Write complete sentences, plain text,
under 250 words. If is_demo is true, start with a line saying this is demo data. If what_if is set, state
clearly that this is a simulated scenario, not a real forecast. Summarize remaining_sites_summary
in one sentence if present. Use staging.total_mats exactly as given for the total.

PLAN:
{plan}
"""


def _call_gemini(plan: dict[str, Any]) -> str:
    from google import genai  # imported lazily so the fallback works without the SDK

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    # Standard Gemini API by default (works for Google AI Studio keys, incl. newer "AQ." ones).
    # Only set GEMINI_VERTEX=1 in .env if you really have a Vertex AI / Google Cloud setup.
    if os.environ.get("GEMINI_VERTEX") == "1":
        client = genai.Client(vertexai=True, api_key=api_key)
    else:
        client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
        contents=PROMPT.format(plan=json.dumps(plan, indent=2)),
    )
    return (resp.text or "").strip()


def generate_briefing(data: dict[str, Any], use_gemini: bool = True) -> dict[str, Any]:
    plan = build_plan(data)
    fallback = format_fallback_briefing(plan)
    if not use_gemini:
        return {"text": fallback, "source": "fallback", "plan": plan, "note": "Gemini disabled"}
    try:
        view = prompt_view(plan)
        text = _call_gemini(view)
        if not text:
            raise RuntimeError("empty Gemini response")
        leak = LEAK_RE.search(text)
        if leak:
            return {"text": fallback, "source": "fallback", "plan": plan,
                    "note": f"Gemini output rejected, leaked placeholder/field name: {leak.group(0)!r}"}
        ok, bad = numbers_are_grounded(text, view)
        if not ok:
            return {"text": fallback, "source": "fallback", "plan": plan,
                    "note": f"Gemini output rejected, ungrounded numbers: {sorted(bad)}"}
        text = GLUE_RE.sub(r"\1 ", text)
        return {"text": text, "source": "gemini", "plan": plan, "note": ""}
    except Exception as e:  # network, quota, missing key, etc. - never block the work plan
        return {"text": fallback, "source": "fallback", "plan": plan, "note": f"Gemini unavailable: {e}"}
