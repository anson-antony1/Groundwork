"""Deterministic 6 PM brief. LLM narration plugs in on top of this; it never sets scores or statuses."""
import logging
import uuid
from datetime import datetime

from functools import lru_cache

from .. import repositories as repo
from ..core.errors import NotFoundError
from ..repositories.records import BriefingRecord, MatStaging, PrioritySite
from . import timeline
from .mats import estimate_mats, resolve_inputs
from .site_status import SiteStatus, list_statuses, portfolio_mode
from .storm_replay_v2 import scenario_source
from .weather import load_snapshot

from . import narration

# Route length is a per-site supervisor input, so the brief never invents one: it quotes the mat range per
# 100 ft of access route with the policy mat defaults (policies/mats_defaults.json).
MAT_ROUTE_LENGTH_FT = 100.0

log = logging.getLogger("groundwork.briefings")

TOP_N = 10


def generate_briefing(now: datetime) -> BriefingRecord:
    # Same order as each site's priority_rank, so the map list and the brief always agree.
    statuses = sorted(list_statuses(now), key=lambda s: s.priority_rank)
    stop = tuple(s.site.id for s in statuses if s.weather_state == "STOP_WORK")
    unknown = [s for s in statuses if s.weather_state == "UNKNOWN"]
    unreviewed = tuple(r for r in repo.reports.list() if r.verification == "unreviewed")
    mode = portfolio_mode()

    mats = mat_staging(statuses)
    summary = (
        f"{len(statuses)} sites evaluated. {len(stop)} under STOP WORK. "
        f"{len(unknown)} have missing weather data and must not be treated as safe. "
        f"{len(unreviewed)} crew reports await review. {_mats_sentence(mats)}"
    )
    template = summary
    narrative_source = "deterministic_template"
    # Optional Gemini narration of the same facts; returns None on any failure, so the template above is the fallback.
    facts = narration.build_facts(statuses, len(unreviewed), mode)
    facts["sites_needing_mats"] = [{"name": m.site_name, "vehicle": m.vehicle, "mats_low": m.min_estimate,
                                    "mats_high": m.max_estimate, "route_length_ft": m.route_length}
                                   for m in mats[:narration.TOP_N]]
    narrated = narration.narrate(facts)
    if narrated:
        summary, narrative_source = narrated, "llm"

    brief = repo.briefings.add(BriefingRecord(
        id=f"brief-{uuid.uuid4().hex[:12]}",
        generated_at=now,
        mode=mode,
        summary=summary,
        top_priority_sites=tuple(
            PrioritySite(s.site.id, s.site.name, s.weather_state, s.hazard_score, s.effective_status)
            for s in statuses[:TOP_N]
        ),
        stop_work_site_ids=stop,
        missing_data_notes=tuple((s.site.id, s.missing_fields) for s in statuses if s.missing_fields),
        crew_report_followups=unreviewed,
        narrative_source=narrative_source,
        deterministic_summary=template,
        mat_staging=mats,
        sources=briefing_sources(mode, narrative_source),
    ))
    timeline.record("briefing_generated", brief.summary, now, ref_id=brief.id)
    log.info("briefing generated", extra={"briefing_id": brief.id, "stop_work_sites": len(stop),
                                          "narrative_source": narrative_source})
    return brief


@lru_cache(maxsize=4)
def _mats_per_route(vehicle: str):
    inputs, applied = resolve_inputs(vehicle, "ft", {"route_length": MAT_ROUTE_LENGTH_FT, "mats_in_inventory": 0})
    return estimate_mats(inputs, applied)


def mat_staging(statuses: list[SiteStatus]) -> tuple[MatStaging, ...]:
    """Sites/vehicles at MATS_FOR_REVIEW, in priority order. STOP WORK sites are skipped: mats never make
    severe weather safe, so no mats are planned there (README section 6)."""
    out = []
    for s in statuses:
        if s.weather_state == "STOP_WORK":
            continue
        for vehicle, call in s.access_call.items():
            if call == "MATS_FOR_REVIEW":
                est = _mats_per_route(vehicle)
                out.append(MatStaging(s.site.id, s.site.name, vehicle, est.min_estimate, est.max_estimate,
                                      MAT_ROUTE_LENGTH_FT, est.inputs.unit))
    return tuple(out)


def _mats_sentence(mats: tuple[MatStaging, ...]) -> str:
    if not mats:
        return "No sites need ground mats for review."
    sites = len({m.site_id for m in mats})
    low, high = min(m.min_estimate for m in mats), max(m.max_estimate for m in mats)
    who = "1 site needs" if sites == 1 else f"{sites} sites need"
    return (f"{who} ground mats for review: about {low}-{high} mats per "
            f"{MAT_ROUTE_LENGTH_FT:g} ft of access route with the policy mat defaults.")


def briefing_sources(mode: str, narrative_source: str) -> tuple[str, ...]:
    """Where the brief's facts came from, for the brief's Sources list."""
    sources = []
    snap = load_snapshot()
    if snap:
        sources.append(f"{snap.get('source', 'Weather snapshot')} (fetched {snap.get('fetched_at', 'unknown')})")
    if mode == "replay":
        state = repo.demo_state.get()
        sources.append(f"Replay: {scenario_source(state.replay_scenario_id) or state.replay_scenario_id}")
    sources.append("Mat ranges: policies/mats_defaults.json (demo defaults, editable)")
    if narrative_source == "llm":
        sources.append("Narration: Gemini, from the facts above only (no new numbers)")
    return tuple(sources)


def get_briefing(briefing_id: str) -> BriefingRecord:
    rec = repo.briefings.get(briefing_id)
    if rec is None:
        raise NotFoundError(f"Briefing '{briefing_id}' does not exist.")
    return rec


def list_briefings() -> list[BriefingRecord]:
    return repo.briefings.list()
