from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Vehicle = Literal["pickup", "heavy_truck"]
SensorMode = Literal["sensor_demo", "sensor_replay"]
ReportCategory = Literal[
    "mud", "standing_water", "flooded_road", "fallen_tree",
    "overhead_hazard", "lightning_observed", "heat", "other",
]


class SensorReading(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    site_id: str = Field(min_length=1, max_length=64)
    seq: int | None = None
    raw_adc: float | None = None
    moisture_index: float | None = Field(None, ge=0, le=100)
    light_raw: float | None = None
    light_index: float | None = Field(None, ge=0, le=100)
    pressure_hpa: float | None = Field(None, gt=300, lt=1100)
    temp_c: float | None = Field(None, gt=-40, lt=85)
    calibration: str | None = Field(None, max_length=64)
    recorded_at: datetime
    mode: SensorMode


class DeviceEvent(BaseModel):
    event: Literal["ack_touch", "crew_flag"]
    seq: int | None = None
    recorded_at: datetime
    mode: SensorMode = "sensor_demo"


class CostInputs(BaseModel):
    """All amounts are supervisor-entered assumptions; nothing here is a real price."""
    mats_rental: float = Field(0, ge=0)
    delivery: float = Field(0, ge=0)
    installation: float = Field(0, ge=0)
    removal: float = Field(0, ge=0)
    delay_not_prevented: float = Field(0, ge=0)
    paid_idle_labor: float = Field(0, ge=0)
    idle_equipment: float = Field(0, ge=0)
    rescheduling: float = Field(0, ge=0)
    extra_contract_cost: float = Field(0, ge=0)


class EvaluateRequest(BaseModel):
    vehicle: Vehicle = "pickup"
    unit: Literal["ft", "m"] = "ft"
    route_length: float = Field(gt=0)
    route_width: float = Field(gt=0)
    mat_length: float = Field(gt=0)
    mat_width: float = Field(gt=0)
    layers: int = Field(1, ge=1, le=3)
    margin_min: float = Field(0.10, ge=0, le=1)
    margin_max: float = Field(0.25, ge=0, le=1)
    mats_in_inventory: int = Field(0, ge=0)
    costs: CostInputs | None = None


class ReplayStart(BaseModel):
    scenario_id: str = Field("demo-storm", max_length=64)
