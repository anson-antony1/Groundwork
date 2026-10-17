from .policies import DEMO_POLICY


def demo_tray_access(moisture_index: float | None, vehicle: str) -> str:
    if moisture_index is None:
        return "UNKNOWN"
    limits = DEMO_POLICY["demo_tray_access"][vehicle]
    if moisture_index < limits["go_below"]:
        return "GO_FOR_REVIEW"
    if moisture_index < limits["mats_below"]:
        return "MATS_FOR_REVIEW"
    return "NO_GO_FOR_REVIEW"
