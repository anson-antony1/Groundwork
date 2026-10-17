from fastapi import APIRouter, Depends

from ..core.clock import now_utc
from ..schemas.common import Envelope, PageEnvelope, WeatherState
from ..schemas.requests import EvaluationIn
from ..schemas.responses import EvaluationOut, SiteDetailOut, SiteOut
from ..services import briefings, evaluation, reports, site_status
from ..services.cost import CostAssumptions
from ..services.mats import resolve_inputs
from . import mappers
from .deps import PageParams, page_params
from .responses import error_responses, ok, paged

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=PageEnvelope[SiteOut], summary="List sites with status")
def list_sites(page: PageParams = Depends(page_params), weather_state: WeatherState | None = None):
    everything = site_status.list_statuses(now_utc())
    ranks = briefings.priority_ranks(everything)  # ranked across all sites, before filtering or paging
    statuses = [s for s in everything if weather_state is None or s.weather_state == weather_state]
    missing = sorted({f for s in statuses for f in s.missing_fields})
    return paged(statuses, page, site_status.portfolio_mode(),
                 lambda s: mappers.site_out(s, ranks[s.site.id]), missing_fields=missing)


@router.get("/{site_id}", response_model=Envelope[SiteDetailOut], responses=error_responses(404),
            summary="Site detail with provenance and crew reports")
def get_site(site_id: str):
    status = site_status.get_status(site_id, now_utc())
    detail = mappers.site_detail_out(status, reports.list_reports(site_id))
    return ok(detail, status.mode, missing_fields=status.missing_fields)


@router.post("/{site_id}/evaluate", response_model=Envelope[EvaluationOut], responses=error_responses(404),
             summary="Compute access, mat range and cost comparison (stateless)")
def evaluate_site(site_id: str, body: EvaluationIn):
    mats, defaults_applied = resolve_inputs(body.vehicle, body.unit, body.model_dump(
        exclude={"vehicle", "unit", "costs"}))
    result = evaluation.evaluate_site(site_id, body.vehicle, mats, defaults_applied,
                                      CostAssumptions(**body.costs.model_dump()), now_utc())
    return ok(mappers.evaluation_out(result), result.status.mode, missing_fields=result.status.missing_fields)
