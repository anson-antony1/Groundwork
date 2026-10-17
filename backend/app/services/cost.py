from dataclasses import asdict, dataclass

LABEL = "Illustrative estimate - edit assumptions. Not guaranteed savings."


@dataclass(frozen=True)
class CostAssumptions:
    mats_rental: float = 0
    delivery: float = 0
    installation: float = 0
    removal: float = 0
    delay_not_prevented: float = 0
    paid_idle_labor: float = 0
    idle_equipment: float = 0
    rescheduling: float = 0
    extra_contract_cost: float = 0


@dataclass(frozen=True)
class CostComparison:
    mats_option: float
    postpone_option: float
    modeled_difference: float
    assumptions: dict
    label: str = LABEL


def compare_costs(c: CostAssumptions) -> CostComparison:
    mats_option = c.mats_rental + c.delivery + c.installation + c.removal + c.delay_not_prevented
    postpone_option = c.paid_idle_labor + c.idle_equipment + c.rescheduling + c.extra_contract_cost
    return CostComparison(
        mats_option=round(mats_option, 2),
        postpone_option=round(postpone_option, 2),
        modeled_difference=round(postpone_option - mats_option, 2),
        assumptions=asdict(c),
    )
