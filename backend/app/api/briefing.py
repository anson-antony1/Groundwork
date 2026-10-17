"""Deterministic 6 PM brief. Rithika's LLM narration plugs in on top of this; it never sets scores."""
import uuid

from fastapi import APIRouter

from ..envelope import envelope, now_utc
from ..services.sites import load_sites
from ..services.snapshot import site_snapshot
from ..state import store

router = APIRouter(prefix="/briefings", tags=["briefings"])

ACCESS_RANK = {"NO_GO_FOR_REVIEW": 0, "MATS_FOR_REVIEW": 1, "UNKNOWN": 2, "GO_FOR_REVIEW": 3}


def _priority_key(s: dict) -> tuple:
    # Critical alerts first, then hazard score, then access restriction, then missing data.
    worst_access = min(ACCESS_RANK[a] for a in s["access_call"].values())
    return (
        s["weather_state"] != "STOP_WORK",
        -(s["hazard_score"] or 0),
        worst_access,
        -len(s["missing_fields"]),
    )


@router.post("/generate")
def generate_briefing():
    now = now_utc()
    snaps = sorted((site_snapshot(s, store, now) for s in load_sites()), key=_priority_key)
    stop = [s["id"] for s in snaps if s["weather_state"] == "STOP_WORK"]
    unknown = [s["id"] for s in snaps if s["weather_state"] == "UNKNOWN"]
    unreviewed = [r for r in store.reports if r["verification"] == "unreviewed"]

    summary = (
        f"{len(snaps)} sites evaluated. {len(stop)} under STOP WORK. "
        f"{len(unknown)} have missing weather data and must not be treated as safe. "
        f"{len(unreviewed)} crew reports await review."
    )
    brief = {
        "id": f"brief-{uuid.uuid4().hex[:8]}",
        "summary": summary,
        "top_priority_sites": [
            {"id": s["id"], "name": s["name"], "weather_state": s["weather_state"],
             "effective_status": s["effective_status"]}
            for s in snaps[:10]
        ],
        "safety_alerts": [{"site_id": sid, "state": "STOP_WORK"} for sid in stop],
        "mat_staging": [],  # filled once per-site route/mat assumptions are stored
        "missing_data_notes": [{"site_id": s["id"], "missing": s["missing_fields"]} for s in snaps if s["missing_fields"]],
        "crew_report_followups": unreviewed,
        "narrative_source": "deterministic_template",
    }
    mode = "replay" if store.replay_active else "simulated"
    store.briefings.append({"generated_at": now.isoformat(), "brief": brief, "mode": mode})
    return envelope(brief, mode)
