"""LLM narration for the 6 PM briefing (Gemini).

Contract (matches the note at the top of briefings.py): the narration NEVER sets scores or statuses. It only
rewrites facts the deterministic briefing already computed into a readable summary. If anything goes wrong
(no key, network error, timeout, bad output) narrate() returns None and the caller keeps the deterministic summary.

Env vars: GEMINI_API_KEY (required for narration), GEMINI_MODEL (default gemini-3.8-flash).
"""
import json
import logging
import os
import re
from typing import Any

log = logging.getLogger("groundwork.narration")

try:  # optional: pick up the repo-level .env during local development
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

TOP_N = 10
TIMEOUT_MS = 15000
NUM_RE = re.compile(r"\d+(?:\.\d+)?")
GLUE_RE = re.compile(r"\b(for|and|to|at|of|in|by|on|with)(?=[A-Z][a-z])")  # fixes "forWindermere"
LEAK_RE = re.compile(
    r"\bN others\b|top_priority_sites|stop_work_sites|stop_work_count|unknown_weather_count|data_mode|"
    r"sites_evaluated|vehicle_access|vehicle_status|missing_fields|unreviewed_crew_reports|sites_with_missing")

PROMPT = """You are writing the short 6 PM operations briefing for a utility dispatcher.
Use ONLY the facts in the JSON below. Do NOT invent sites, numbers, alerts, or statuses, and do not add numbers
together or compute new ones. Keep every number exactly as given. Never mention JSON field names; use plain English.
Rules:
- A weather_state of STOP_WORK means work stops at that site. List those sites first.
- Sites with UNKNOWN weather or missing data must NOT be described as safe.
- The access calls are advisory ("for review"); do not turn them into orders and do not change any status.
- If data_mode is not "live", say plainly what kind of data this is (for example simulated or sensor demo).
- Name at most 5 sites per point, then say "and others" (no number, never a placeholder like N).
- Mention unreviewed crew reports if the count is above zero.
Plain text, complete sentences, under 200 words.

FACTS:
{facts}
"""


def _plain(v: Any) -> Any:
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def build_facts(statuses: list, unreviewed_count: int, mode: str) -> dict[str, Any]:
    """`statuses` must already be sorted by priority (as briefings.generate_briefing does)."""
    stop = [s for s in statuses if s.weather_state == "STOP_WORK"]
    unknown = [s for s in statuses if s.weather_state == "UNKNOWN"]
    return {
        "data_mode": mode,
        "sites_evaluated": len(statuses),
        "stop_work_count": len(stop),
        "unknown_weather_count": len(unknown),
        "sites_with_missing_data": sum(1 for s in statuses if s.missing_fields),
        "unreviewed_crew_reports": unreviewed_count,
        "stop_work_sites": [s.site.name for s in stop[:TOP_N]],
        "top_priority_sites": [
            {"rank": i, "name": s.site.name, "weather_state": s.weather_state, "hazard_score": s.hazard_score,
             "vehicle_access": _plain(s.access_call), "vehicle_status": _plain(s.effective_status),
             "missing_fields": list(s.missing_fields)}
            for i, s in enumerate(statuses[:TOP_N], start=1)
        ],
    }


def numbers_are_grounded(text: str, facts: dict[str, Any]) -> tuple[bool, set[str]]:
    def norm(n: str) -> str:
        return n.rstrip("0").rstrip(".") if "." in n else n
    allowed = set(NUM_RE.findall(json.dumps(facts))) | {"6"} | {str(i) for i in range(1, TOP_N + 1)}
    allowed_norm = {norm(a) for a in allowed}
    bad = {n for n in NUM_RE.findall(text) if norm(n) not in allowed_norm}
    return (not bad, bad)


def _call_gemini(facts: dict[str, Any]) -> str:
    from google import genai  # lazy: the backend still runs if the SDK isn't installed
    from google.genai import types

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=TIMEOUT_MS))
    resp = client.models.generate_content(
        model=os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
        contents=PROMPT.format(facts=json.dumps(facts, indent=2)),
    )
    return (resp.text or "").strip()


def narrate(facts: dict[str, Any]) -> str | None:
    """Returns narrated text, or None to signal 'keep the deterministic summary'."""
    try:
        text = _call_gemini(facts)
        if not text:
            raise RuntimeError("empty response")
        leak = LEAK_RE.search(text)
        if leak:
            raise RuntimeError(f"leaked placeholder/field name {leak.group(0)!r}")
        ok, bad = numbers_are_grounded(text, facts)
        if not ok:
            raise RuntimeError(f"ungrounded numbers {sorted(bad)}")
        return GLUE_RE.sub(r"\1 ", text)
    except Exception as e:  # never break the briefing endpoint over narration
        log.warning("narration skipped: %s", e)
        return None
