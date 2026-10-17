"""P9 mats vs postpone cost (README section 6). Blank inputs count as $0 but are reported in `not_entered`,
so a forgotten cost can't silently make one option look cheaper."""
from dataclasses import asdict, dataclass

LABEL = "Illustrative estimate - edit assumptions. Not guaranteed savings. Items not entered count as $0."


@dataclass(frozen=True)
class CostAssumptions:
    """None = the supervisor left it blank (not entered). 0 = entered as zero."""
    mats_rental: float | None = None
    delivery: float | None = None
    installation: float | None = None
    removal: float | None = None
    delay_not_prevented: float | None = None
    paid_idle_labor: float | None = None
    idle_equipment: float | None = None
    rescheduling: float | None = None
    extra_contract_cost: float | None = None
    # Hourly items for the postpone option: idle_hours x (labor + equipment rate), added to the flat amounts.
    idle_hours: float | None = None
    labor_rate_per_hour: float | None = None
    equipment_rate_per_hour: float | None = None


@dataclass(frozen=True)
class CostComparison:
    mats_option: float
    postpone_option: float
    modeled_difference: float
    assumptions: dict
    not_entered: tuple[str, ...]  # cost items left blank (counted as $0)
    label: str = LABEL

    @property
    def complete(self) -> bool:
        return not self.not_entered


def _n(x: float | None) -> float:
    return x or 0.0


def _not_entered(c: CostAssumptions) -> tuple[str, ...]:
    hours = c.idle_hours is not None
    covered = {
        "mats_rental": c.mats_rental is not None,
        "delivery": c.delivery is not None,
        "installation": c.installation is not None,
        "removal": c.removal is not None,
        "delay_not_prevented": c.delay_not_prevented is not None,
        # Labor/equipment count as entered via a flat amount OR hours x hourly rate.
        "idle_labor": c.paid_idle_labor is not None or (hours and c.labor_rate_per_hour is not None),
        "idle_equipment": c.idle_equipment is not None or (hours and c.equipment_rate_per_hour is not None),
        "rescheduling": c.rescheduling is not None,
        "extra_contract_cost": c.extra_contract_cost is not None,
    }
    return tuple(item for item, ok in covered.items() if not ok)


def compare_costs(c: CostAssumptions) -> CostComparison:
    mats_option = _n(c.mats_rental) + _n(c.delivery) + _n(c.installation) + _n(c.removal) + _n(c.delay_not_prevented)
    hourly = _n(c.idle_hours) * (_n(c.labor_rate_per_hour) + _n(c.equipment_rate_per_hour))
    postpone_option = (_n(c.paid_idle_labor) + _n(c.idle_equipment) + _n(c.rescheduling)
                       + _n(c.extra_contract_cost) + hourly)
    return CostComparison(
        mats_option=round(mats_option, 2),
        postpone_option=round(postpone_option, 2),
        modeled_difference=round(postpone_option - mats_option, 2),
        assumptions=asdict(c),
        not_entered=_not_entered(c),
    )
