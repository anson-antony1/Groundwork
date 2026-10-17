from collections.abc import Callable, Iterable, Sequence
from typing import Any

from ..core.clock import now_utc
from ..schemas.common import ErrorResponse
from .deps import PageParams

_ERROR_DESCRIPTIONS = {
    400: "Malformed request",
    401: "Missing or invalid sensor token",
    404: "Resource not found",
    413: "Upload too large",
    415: "Unsupported upload type",
    422: "Validation failed",
    429: "Rate limit exceeded",
    500: "Unexpected server error",
}


def error_responses(*codes: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI docs for the shared error shape on the given status codes."""
    return {code: {"model": ErrorResponse, "description": _ERROR_DESCRIPTIONS[code]} for code in codes}


def ok(data: Any, mode: str, *, sources: Iterable[str] = (), missing_fields: Iterable[str] = (),
       errors: Iterable[str] = ()) -> dict:
    return {
        "data": data,
        "mode": mode,
        "generated_at": now_utc(),
        "sources": list(sources),
        "missing_fields": list(missing_fields),
        "errors": list(errors),
    }


def paged(items: Sequence, page: PageParams, mode: str, to_dto: Callable[[Any], Any], **meta) -> dict:
    window = items[page.offset: page.offset + page.limit]
    body = ok([to_dto(i) for i in window], mode, **meta)
    body["pagination"] = {"limit": page.limit, "offset": page.offset, "total": len(items)}
    return body
