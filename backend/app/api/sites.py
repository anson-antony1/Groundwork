from fastapi import APIRouter, HTTPException, Query

from ..envelope import envelope, now_utc
from ..schemas import CostInputs, EvaluateRequest
from ..services.cost import compare_costs
from ..services.mats import estimate_mats
from ..services.sites import get_site, load_sites
from ..services.snapshot import site_snapshot
from ..state import store

router = APIRouter(prefix="/sites", tags=["sites"])


def _require_site(site_id: str) -> dict:
    site = get_site(site_id)
    if site is None:
        raise HTTPException(404, f"Unknown site_id {site_id!r}")
    return site


@router.get("")
def list_sites(weather_state: str | None = Query(None, description="Filter, e.g. STOP_WORK")):
    now = now_utc()
    snaps = [site_snapshot(s, store, now) for s in load_sites()]
    if weather_state:
        snaps = [s for s in snaps if s["weather_state"] == weather_state]
    mode = "replay" if store.replay_active else "simulated"
    missing = sorted({f for s in snaps for f in s["missing_fields"]})
    return envelope(snaps, mode, missing_fields=missing)


@router.get("/{site_id}")
def site_detail(site_id: str):
    snap = site_snapshot(_require_site(site_id), store, now_utc())
    reports = [r for r in store.reports if r["site_id"] == site_id]
    return envelope({**snap, "reports": reports}, snap["mode"], missing_fields=snap["missing_fields"])


@router.post("/{site_id}/evaluate")
def evaluate_site(site_id: str, req: EvaluateRequest):
    snap = site_snapshot(_require_site(site_id), store, now_utc())
    mats = estimate_mats(
        req.route_length, req.route_width, req.mat_length, req.mat_width,
        req.layers, req.margin_min, req.margin_max, req.mats_in_inventory, req.unit,
    )
    stop_work = snap["weather_state"] == "STOP_WORK"
    data = {
        "site_id": site_id,
        "vehicle": req.vehicle,
        "weather_state": snap["weather_state"],
        "access_call": snap["access_call"][req.vehicle],
        "effective_status": snap["effective_status"][req.vehicle],
        "mats_estimate": mats,
        # Mats never make lightning/flood/severe weather safe (README section 6).
        "mats_recommended": (not stop_work) and snap["access_call"][req.vehicle] == "MATS_FOR_REVIEW",
        "cost_comparison": compare_costs(req.costs or CostInputs()),
        "notes": (
            ["STOP WORK active: cost comparison is a planning scenario only, not a recommendation."]
            if stop_work else []
        ),
    }
    return envelope(data, snap["mode"], missing_fields=snap["missing_fields"])
