"""Deterministic 6 PM brief. LLM narration plugs in on top of this; it never sets scores or statuses."""
import logging
import uuid
from datetime import datetime

from .. import repositories as repo
from ..core.errors import NotFoundError
from ..repositories.records import BriefingRecord, PrioritySite
from . import timeline
from .site_status import list_statuses, portfolio_mode

from . import narration

log = logging.getLogger("groundwork.briefings")

TOP_N = 10


<<<<<<< HEAD
=======
def _priority_key(s: SiteStatus) -> tuple:
    # Critical alerts first, then hazard score, then access restriction, then missing data.
    return (
        s.weather_state != "STOP_WORK",
        -(s.hazard_score or 0),
        min(ACCESS_RANK[a] for a in s.access_call.values()),
        -len(s.missing_fields),
    )


def priority_ranks(statuses: list[SiteStatus]) -> dict[str, int]:
    """1-based rank of every site in briefing order, so the map list and the 6 PM brief agree."""
    return {s.site.id: i for i, s in enumerate(sorted(statuses, key=_priority_key), start=1)}


>>>>>>> fbe81baf269f988837db77d93d924de7de1dd797
def generate_briefing(now: datetime) -> BriefingRecord:
    # Same order as each site's priority_rank, so the map list and the brief always agree.
    statuses = sorted(list_statuses(now), key=lambda s: s.priority_rank)
    stop = tuple(s.site.id for s in statuses if s.weather_state == "STOP_WORK")
    unknown = [s for s in statuses if s.weather_state == "UNKNOWN"]
    unreviewed = tuple(r for r in repo.reports.list() if r.verification == "unreviewed")
    mode = portfolio_mode()

    summary = (
        f"{len(statuses)} sites evaluated. {len(stop)} under STOP WORK. "
        f"{len(unknown)} have missing weather data and must not be treated as safe. "
        f"{len(unreviewed)} crew reports await review."
    )
    template = summary
    narrative_source = "deterministic_template"
    # Optional Gemini narration of the same facts; returns None on any failure, so the template above is the fallback.
    narrated = narration.narrate(narration.build_facts(statuses, len(unreviewed), mode))
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
    ))
    timeline.record("briefing_generated", brief.summary, now, ref_id=brief.id)
    log.info("briefing generated", extra={"briefing_id": brief.id, "stop_work_sites": len(stop),
                                          "narrative_source": narrative_source})
    return brief


def get_briefing(briefing_id: str) -> BriefingRecord:
    rec = repo.briefings.get(briefing_id)
    if rec is None:
        raise NotFoundError(f"Briefing '{briefing_id}' does not exist.")
    return rec


def list_briefings() -> list[BriefingRecord]:
    return repo.briefings.list()
