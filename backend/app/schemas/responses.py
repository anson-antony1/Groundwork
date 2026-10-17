"""Response DTOs. Internal records are mapped onto these in api/mappers.py; nothing else is serialized."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from .common import AccessCall, DataMode, EffectiveStatus, ReportCategory, SensorMode, Vehicle, WeatherState
from .requests import CostInputs


class HealthOut(BaseModel):
    status: Literal["ok"]
    version: str
    storage: str
    sites_loaded: int
    replay_active: bool
    fixtures: dict[str, bool]
    connectors: dict[str, Literal["not_built", "ok", "degraded"]]


class VehicleAccessOut(BaseModel):
    pickup: AccessCall
    heavy_truck: AccessCall


class VehicleStatusOut(BaseModel):
    pickup: EffectiveStatus
    heavy_truck: EffectiveStatus


class ObservationOut(BaseModel):
    """One sourced value with provenance (README section 4). `value` is null when unavailable."""
    variable: str
    value: float | None
    unit: str
    source: str
    kind: Literal["observed", "forecast", "modeled", "survey"]
    valid_at: str
    fetched_at: datetime
    quality: Literal["available", "stale", "missing", "simulated", "sensor_demo", "sensor_replay"]
    reference_url: str | None


class HazardSubscoresOut(BaseModel):
    """Parts behind hazard_score. rain + wind + heat are the points that sum to the score (max 4/3/3).
    flood and storm are alert-driven: 10 if a matching NWS alert is active (it forces STOP WORK rather
    than adding points), 0 if the alert check found none, null if the check failed."""
    rain: float | None
    wind: float | None
    heat: float | None
    flood: float | None
    storm: float | None


class WeatherAlertOut(BaseModel):
    event: str
    source: str
    severity: str | None = None
    onset: datetime | None = None
    expires: datetime | None = None
    reference_url: str | None = None


class CallReasonsOut(BaseModel):
    """'Why this call?' inputs (README section 8)."""
    weather_triggers: list[str]
    soil_drainage: str | None
    vehicle_class: str | None


class SiteOut(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    region: str | None
    location_origin: str
    hazard_score: float | None = Field(None, ge=0, le=10)
    weather_state: WeatherState
    access_call: VehicleAccessOut
    effective_status: VehicleStatusOut
    data_status: Literal["sensor_demo", "not_fetched", "available", "stale"]
    observations: list[ObservationOut]
    missing_fields: list[str]
    evaluated_at: datetime
    hazard_explanation: list[str] = Field(default_factory=list)
    alert_events: list[str] = Field(default_factory=list)
<<<<<<< HEAD
    mode: DataMode
    priority_rank: int | None = Field(None, ge=1, description="Rank across all sites, 1 = most urgent; same order as the 6 PM briefing")
    hazard_subscores: HazardSubscoresOut | None = None
    alerts: list[WeatherAlertOut] = Field(default_factory=list)
    reasons: CallReasonsOut | None = None
=======
    priority_rank: int | None = Field(
        None, ge=1, description="Position in the 6 PM briefing's ranking across all sites (1 = most urgent); list only")
>>>>>>> fbe81baf269f988837db77d93d924de7de1dd797


class ReportOut(BaseModel):
    id: str
    site_id: str
    description: str
    category_user: ReportCategory
    category_ai: ReportCategory | None
    ai_confidence: float | None = Field(None, ge=0, le=1)
    image_url: str | None
    reported_at: datetime
    verification: Literal["unreviewed", "confirmed", "rejected"]


class SiteDetailOut(SiteOut):
    reports: list[ReportOut]


class MatInputsOut(BaseModel):
    route_length: float
    route_width: float
    mat_length: float
    mat_width: float
    layers: int
    margin_min: float
    margin_max: float


class MatOverrideOut(BaseModel):
    quantity: int
    reason: str


class MatsEstimateOut(BaseModel):
    inputs: MatInputsOut
    defaults_applied: list[str]
    base_mats: int
    min_estimate: int
    max_estimate: int
    planned_quantity: int
    override: MatOverrideOut | None
    mats_in_inventory: int
    shortfall: int
    unit: Literal["ft", "m"]
    steps: list[str]
    method: str
    caveat: str


class CostComparisonOut(BaseModel):
    mats_option: float
    postpone_option: float
    modeled_difference: float
    assumptions: CostInputs
    label: str


class EvaluationOut(BaseModel):
    site_id: str
    vehicle: Vehicle
    weather_state: WeatherState
    access_call: AccessCall
    effective_status: EffectiveStatus
    mats_estimate: MatsEstimateOut
    mats_recommended: bool
    cost_comparison: CostComparisonOut
    notes: list[str]


class ReadingOut(BaseModel):
    device_id: str
    site_id: str
    seq: int | None
    raw_adc: float | None
    moisture_index: float | None
    light_raw: float | None
    light_index: float | None
    pressure_hpa: float | None
    temp_c: float | None
    calibration: str | None
    recorded_at: datetime
    received_at: datetime
    mode: SensorMode


class DisplayOut(BaseModel):
    device_id: str
    site_id: str
    effective_status: EffectiveStatus
    code: Literal["GO", "MATS", "REVIEW", "NOGO", "STOP", "UNKNOWN"]
    lcd_line1: str = Field(max_length=16)
    lcd_line2: str = Field(max_length=16)
    alarm: bool
    acknowledged_at: datetime | None
    mode: DataMode
    generated_at: datetime


class DeviceEventOut(BaseModel):
    id: str
    device_id: str
    site_id: str
    event: Literal["ack_touch", "crew_flag"]
    seq: int | None
    status_at_event: EffectiveStatus
    recorded_at: datetime
    received_at: datetime
    mode: SensorMode


class ReplayOut(BaseModel):
    active: bool
    scenario_id: str | None
    source: str | None
    started_at: datetime | None


class ReplayScenarioOut(BaseModel):
    id: str
    title: str
    event: str
    source: str | None
    reference_url: str | None
    onset: datetime | None
    expires: datetime | None
    area: str | None


class PrioritySiteOut(BaseModel):
    id: str
    name: str
    weather_state: WeatherState
    hazard_score: float | None
    effective_status: VehicleStatusOut


class MissingDataNoteOut(BaseModel):
    site_id: str
    missing_fields: list[str]


class BriefingOut(BaseModel):
    id: str
    generated_at: datetime
    mode: DataMode
    summary: str
    top_priority_sites: list[PrioritySiteOut]
    stop_work_site_ids: list[str]
    missing_data_notes: list[MissingDataNoteOut]
    crew_report_followups: list[ReportOut]
    narrative_source: Literal["deterministic_template", "llm"]
    deterministic_summary: str | None = Field(
        None, description="The template summary built from the facts, kept even when `summary` is an LLM narrative")


class TimelineEventOut(BaseModel):
    id: str
    kind: Literal[
        "ack_touch", "crew_flag", "crew_flag_cleared", "hazard_report", "report_reviewed",
        "replay_started", "replay_stopped", "briefing_generated",
    ]
    site_id: str | None
    summary: str
    ref_id: str | None
    at: datetime


class DemoResetOut(BaseModel):
    replay_stopped: bool
    reports_cleared: int
    device_events_cleared: int


class AccessThresholdsOut(BaseModel):
    go_below: float
    mats_below: float


class DemoTrayAccessOut(BaseModel):
    basis: str
    pickup: AccessThresholdsOut
    heavy_truck: AccessThresholdsOut


class HazardWeightsOut(BaseModel):
    rain: float
    wind: float
    heat: float
    flood: float
    storm: float


class MatDefaultsOut(BaseModel):
    label: str
    unit: Literal["ft", "m"]
    route_width: float
    mat_length: float
    mat_width: float
    layers: dict[str, int]
    margin_min: float
    margin_max: float


class PolicyOut(BaseModel):
    label: str
    demo_tray_access: DemoTrayAccessOut
    hazard_weights: HazardWeightsOut
    hazard_policy: dict[str, Any] | None = Field(
        None, description="The live hazard rules: points per factor, CAUTION/STOP_WORK thresholds, stop-work alert terms")
    sensor_stale_seconds: int
    mat_defaults: MatDefaultsOut
