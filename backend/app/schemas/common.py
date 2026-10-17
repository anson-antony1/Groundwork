from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

DataMode = Literal["live", "cached", "replay", "simulated", "sensor_demo", "sensor_replay"]
SensorMode = Literal["sensor_demo", "sensor_replay"]
Vehicle = Literal["pickup", "heavy_truck"]
WeatherState = Literal["NORMAL", "CAUTION", "STOP_WORK", "UNKNOWN"]
AccessCall = Literal["GO_FOR_REVIEW", "MATS_FOR_REVIEW", "NO_GO_FOR_REVIEW", "UNKNOWN"]
EffectiveStatus = Literal[
    "GO_FOR_REVIEW", "MATS_FOR_REVIEW", "NO_GO_FOR_REVIEW", "SUPERVISOR_REVIEW", "STOP_WORK", "UNKNOWN"
]
ReportCategory = Literal[
    "mud", "standing_water", "flooded_road", "fallen_tree",
    "overhead_hazard", "lightning_observed", "heat", "other",
]

T = TypeVar("T")


class RequestModel(BaseModel):
    """Base for request bodies: unknown fields are rejected (422), never silently dropped."""
    model_config = ConfigDict(extra="forbid")


class Pagination(BaseModel):
    limit: int
    offset: int
    total: int


class _Meta(BaseModel):
    mode: DataMode
    generated_at: datetime
    sources: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    # Non-fatal data-quality notes (e.g. a fixture not added yet). Request failures use ErrorResponse instead.
    errors: list[str] = Field(default_factory=list)


class Envelope(_Meta, Generic[T]):
    data: T


class PageEnvelope(_Meta, Generic[T]):
    data: list[T]
    pagination: Pagination


class ErrorDetail(BaseModel):
    field: str | None = None
    issue: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
