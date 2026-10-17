from fastapi import APIRouter, Depends

from ..core.clock import now_utc
from ..schemas.common import Envelope, PageEnvelope, WeatherState
from ..schemas.requests import EvaluationIn
from ..schemas.responses import EvaluationOut, SiteDetailOut, SiteOut
from ..services import evaluation, reports, site_status
from ..services.cost import CostAssumptions
from ..services.mats import MatInputs
from . import mappers
from .deps import PageParams, page_params
from .responses import error_responses, ok, paged

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=PageEnvelope[SiteOut], summary="List sites with status")
def list_sites(page: PageParams = Depends(page_params), weather_state: WeatherState | None = None):
    statuses = site_status.list_statuses(now_utc(), weather_state)
    missing = sorted({f for s in statuses for f in s.missing_fields})
    return paged(statuses, page, site_status.portfolio_mode(), mappers.site_out, missing_fields=missing)


@router.get("/{site_id}", response_model=Envelope[SiteDetailOut], responses=error_responses(404),
            summary="Site detail with provenance and crew reports")
def get_site(site_id: str):
    status = site_status.get_status(site_id, now_utc())
    detail = mappers.site_detail_out(status, reports.list_reports(site_id))
    return ok(detail, status.mode, missing_fields=status.missing_fields)


@router.post("/{site_id}/evaluate", response_model=Envelope[EvaluationOut], responses=error_responses(404),
             summary="Compute access, mat range and cost comparison (stateless)")
def evaluate_site(site_id: str, body: EvaluationIn):
    mats = MatInputs(
        route_length=body.route_length, route_width=body.route_width,
        mat_length=body.mat_length, mat_width=body.mat_width, layers=body.layers,
        margin_min=body.margin_min, margin_max=body.margin_max,
        mats_in_inventory=body.mats_in_inventory, unit=body.unit,
    )
    result = evaluation.evaluate_site(site_id, body.vehicle, mats, CostAssumptions(**body.costs.model_dump()), now_utc())
    return ok(mappers.evaluation_out(result), result.status.mode, missing_fields=result.status.missing_fields)
