"""Internal storage records. These are never returned directly; api/mappers.py maps them to DTOs."""
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ReadingRecord:
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
    mode: str
    row_id: int = 0  # storage-internal, assigned by the repository


@dataclass(frozen=True)
class DeviceEventRecord:
    id: str
    device_id: str
    site_id: str
    event: str
    seq: int | None
    status_at_event: str
    recorded_at: datetime
    received_at: datetime
    mode: str


@dataclass(frozen=True)
class ReportRecord:
    id: str
    site_id: str
    description: str
    category_user: str
    category_ai: str | None
    ai_confidence: float | None
    image_filename: str | None  # storage-internal; exposed only as a URL
    reported_at: datetime
    verification: str


@dataclass(frozen=True)
class TimelineRecord:
    id: str
    kind: str
    site_id: str | None
    summary: str
    ref_id: str | None
    at: datetime


@dataclass(frozen=True)
class PrioritySite:
    id: str
    name: str
    weather_state: str
    hazard_score: float | None
    effective_status: dict[str, str]


@dataclass(frozen=True)
class BriefingRecord:
    id: str
    generated_at: datetime
    mode: str
    summary: str
    top_priority_sites: tuple[PrioritySite, ...]
    stop_work_site_ids: tuple[str, ...]
    missing_data_notes: tuple[tuple[str, tuple[str, ...]], ...]
    crew_report_followups: tuple[ReportRecord, ...]  # snapshot at generation time
    narrative_source: str
    deterministic_summary: str | None = None  # template text; None on briefs saved before this existed
    mat_staging: tuple["MatStaging", ...] = ()
    sources: tuple[str, ...] = ()


@dataclass(frozen=True)
class MatStaging:
    """A site/vehicle whose access call is MATS_FOR_REVIEW, with the policy-default mat range per route_length."""
    site_id: str
    site_name: str
    vehicle: str
    min_estimate: int
    max_estimate: int
    route_length: float
    unit: str


@dataclass(frozen=True)
class DemoState:
    replay_active: bool = False
    replay_scenario_id: str | None = None
    replay_source: str | None = None
    replay_started_at: datetime | None = None
    acknowledged_at: datetime | None = None
    crew_flag_at: datetime | None = None
    demo_vehicle: str = "heavy_truck"
