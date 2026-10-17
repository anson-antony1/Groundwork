from datetime import datetime, timezone
from typing import Any


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def envelope(
    data: Any,
    mode: str,
    sources: list | None = None,
    missing_fields: list | None = None,
    errors: list | None = None,
) -> dict:
    """Shared response shape from the README API contract."""
    return {
        "data": data,
        "mode": mode,
        "generated_at": now_utc().isoformat(),
        "sources": sources or [],
        "missing_fields": missing_fields or [],
        "errors": errors or [],
    }
