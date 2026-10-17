"""Alert classification v1: informational marine advisories stay visible but do not raise CAUTION."""
INFORMATIONAL_TERMS = ("surf", "rip current", "beach hazards")


def classify_alerts_v1(events: list[str], policy: dict) -> tuple[str, list[str]]:
    """Returns ('STOP_WORK' | 'CAUTION' | 'NONE', all matching event names)."""
    terms = policy["stop_work_alert_terms"]
    stop = [e for e in events if any(t in e.lower() for t in terms)]
    if stop:
        return "STOP_WORK", stop
    actionable = [e for e in events if not any(t in e.lower() for t in INFORMATIONAL_TERMS)]
    return ("CAUTION" if actionable else "NONE"), list(events)
