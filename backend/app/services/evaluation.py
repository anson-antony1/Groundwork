from dataclasses import dataclass
from datetime import datetime

from .cost import CostAssumptions, CostComparison, compare_costs
from .mats import MatEstimate, MatInputs, estimate_mats
from .site_status import SiteStatus, get_status


@dataclass(frozen=True)
class Evaluation:
    status: SiteStatus
    vehicle: str
    mats_estimate: MatEstimate
    mats_recommended: bool
    cost_comparison: CostComparison
    notes: tuple[str, ...]


def evaluate_site(site_id: str, vehicle: str, mats: MatInputs, costs: CostAssumptions, now: datetime) -> Evaluation:
    """Stateless calculation; nothing is stored."""
    status = get_status(site_id, now)
    stop_work = status.weather_state == "STOP_WORK"
    return Evaluation(
        status=status,
        vehicle=vehicle,
        mats_estimate=estimate_mats(mats),
        # Mats never make lightning/flood/severe weather safe (README section 6).
        mats_recommended=not stop_work and status.access_call[vehicle] == "MATS_FOR_REVIEW",
        cost_comparison=compare_costs(costs),
        notes=("STOP WORK active: cost comparison is a planning scenario only, not a recommendation.",)
        if stop_work else (),
    )
