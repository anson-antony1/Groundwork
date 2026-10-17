from dataclasses import dataclass
from typing import Annotated

from fastapi import Query

from ..config import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from ..core.auth import require_role, require_sensor  # noqa: F401  (re-exported for routers)


@dataclass(frozen=True)
class PageParams:
    limit: int
    offset: int


def page_params(
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_LIMIT, description="Page size")] = DEFAULT_PAGE_LIMIT,
    offset: Annotated[int, Query(ge=0, description="Items to skip")] = 0,
) -> PageParams:
    return PageParams(limit=limit, offset=offset)
