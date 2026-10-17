from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from .common import RequestModel, SensorMode, Vehicle


class SensorReadingIn(RequestModel):
    """One beacon reading, as posted by hardware/serial_bridge.py (README 5.8)."""
    device_id: str = Field(min_length=1, max_length=64)
    site_id: str = Field(min_length=1, max_length=64)
    seq: int | None = Field(None, ge=0)
    raw_adc: float | None = Field(None, ge=0, le=1023)
    moisture_index: float | None = Field(None, ge=0, le=100)
    light_raw: float | None = Field(None, ge=0, le=1023)
    light_index: float | None = Field(None, ge=0, le=100)
    pressure_hpa: float | None = Field(None, gt=300, lt=1100)
    temp_c: float | None = Field(None, gt=-40, lt=85)
    calibration: str | None = Field(None, max_length=64)
    recorded_at: datetime
    mode: SensorMode


class DeviceEventIn(RequestModel):
    event: Literal["ack_touch", "crew_flag"]
    seq: int | None = Field(None, ge=0)
    recorded_at: datetime
    mode: SensorMode = "sensor_demo"


class CostInputs(RequestModel):
    """Supervisor-entered assumptions. Nothing here is a real price."""
    mats_rental: float = Field(0, ge=0)
    delivery: float = Field(0, ge=0)
    installation: float = Field(0, ge=0)
    removal: float = Field(0, ge=0)
    delay_not_prevented: float = Field(0, ge=0)
    paid_idle_labor: float = Field(0, ge=0)
    idle_equipment: float = Field(0, ge=0)
    rescheduling: float = Field(0, ge=0)
    extra_contract_cost: float = Field(0, ge=0)


class EvaluationIn(RequestModel):
    vehicle: Vehicle = "pickup"
    unit: Literal["ft", "m"] = "ft"
    route_length: float = Field(gt=0, le=100_000)
    route_width: float = Field(gt=0, le=1_000)
    mat_length: float = Field(gt=0, le=100)
    mat_width: float = Field(gt=0, le=100)
    layers: int = Field(1, ge=1, le=3)
    margin_min: float = Field(0.10, ge=0, le=1)
    margin_max: float = Field(0.25, ge=0, le=1)
    mats_in_inventory: int = Field(0, ge=0)
    costs: CostInputs = Field(default_factory=CostInputs)

    @model_validator(mode="after")
    def _margins_ordered(self) -> "EvaluationIn":
        if self.margin_min > self.margin_max:
            raise ValueError("margin_min must be <= margin_max")
        return self


class ReplayIn(RequestModel):
    scenario_id: str = Field("demo-storm", pattern=r"^[A-Za-z0-9_-]{1,64}$")
