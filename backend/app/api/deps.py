import logging
import secrets
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..config import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, SENSOR_TOKEN
from ..core.errors import UnauthorizedError

log = logging.getLogger("groundwork.auth")

_bearer = HTTPBearer(auto_error=False)


def require_sensor_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    """Lightweight shared-secret check for the serial bridge (README section 10, security minimum)."""
    if creds is None or not secrets.compare_digest(creds.credentials, SENSOR_TOKEN):
        log.warning("sensor token rejected", extra={"token_present": creds is not None})
        raise UnauthorizedError("Missing or invalid sensor token.", headers={"WWW-Authenticate": "Bearer"})


@dataclass(frozen=True)
class PageParams:
    limit: int
    offset: int


def page_params(
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT, description="Page size")] = DEFAULT_PAGE_LIMIT,
    offset: Annotated[int, Query(ge=0, description="Items to skip")] = 0,
) -> PageParams:
    return PageParams(limit=limit, offset=offset)
