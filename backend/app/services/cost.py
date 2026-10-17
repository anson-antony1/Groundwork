from ..schemas import CostInputs

LABEL = "Illustrative estimate - edit assumptions. Not guaranteed savings."


def compare_costs(c: CostInputs) -> dict:
    mats_option = c.mats_rental + c.delivery + c.installation + c.removal + c.delay_not_prevented
    postpone_option = c.paid_idle_labor + c.idle_equipment + c.rescheduling + c.extra_contract_cost
    return {
        "mats_option": round(mats_option, 2),
        "postpone_option": round(postpone_option, 2),
        "modeled_difference": round(postpone_option - mats_option, 2),
        "inputs": c.model_dump(),
        "label": LABEL,
    }
