"""Internal records -> response DTOs. The only place storage shapes meet the public contract."""
from dataclasses import asdict
from datetime import datetime

from ..repositories.records import (
    BriefingRecord, DemoState, DeviceEventRecord, ReadingRecord, ReportRecord, TimelineRecord,
)
from ..schemas.requests import CostInputs
from ..schemas.responses import (
    BriefingOut, CallReasonsOut, CostComparisonOut, HazardSubscoresOut, WeatherAlertOut, MatInputsOut, MatOverrideOut, DeviceEventOut, DisplayOut, EvaluationOut, MatsEstimateOut,
    MatStagingOut, MissingDataNoteOut, ObservationOut, PrioritySiteOut, ReadingOut, ReplayOut, ReportOut, SiteDetailOut, SiteOut, StopWorkForecastOut,
    TimelineEventOut, VehicleAccessOut, VehicleStatusOut,
)
from ..services.display import Display
from ..services.evaluation import Evaluation
from ..services.site_status import SiteStatus


def site_out(s: SiteStatus) -> SiteOut:
    return SiteOut(
        id=s.site.id, name=s.site.name, latitude=s.site.latitude, longitude=s.site.longitude,
        region=s.site.region, location_origin=s.site.location_origin,
        hazard_score=s.hazard_score, weather_state=s.weather_state,
        access_call=VehicleAccessOut(**s.access_call),
        effective_status=VehicleStatusOut(**s.effective_status),
        data_status=s.data_status, observations=[ObservationOut(**o) for o in s.observations],
        missing_fields=list(s.missing_fields), evaluated_at=s.evaluated_at,
        hazard_explanation=list(s.hazard_explanation), alert_events=list(s.alert_events),
        mode=s.mode, priority_rank=s.priority_rank,
        hazard_subscores=HazardSubscoresOut(**s.hazard_subscores) if s.hazard_subscores else None,
        alerts=[WeatherAlertOut(**a) for a in s.alerts],
        reasons=CallReasonsOut(**s.reasons) if s.reasons else None,
        advisories=list(s.advisories),
        forecast_model=StopWorkForecastOut(**s.forecast_model) if s.forecast_model else None,
    )


def site_detail_out(s: SiteStatus, reports: list[ReportRecord]) -> SiteDetailOut:
    return SiteDetailOut(**site_out(s).model_dump(), reports=[report_out(r) for r in reports])


def report_out(r: ReportRecord) -> ReportOut:
    return ReportOut(
        id=r.id, site_id=r.site_id, description=r.description, category_user=r.category_user,
        category_ai=r.category_ai, ai_confidence=r.ai_confidence,
        image_url=f"/uploads/{r.image_filename}" if r.image_filename else None,
        reported_at=r.reported_at, verification=r.verification,
        reported_by=r.reported_by, verified_by=r.verified_by,
        # No AI tagger runs (README status: P10), so nothing is ever "pending".
        ai_status="done" if r.category_ai is not None else "unavailable",
    )


def evaluation_out(e: Evaluation) -> EvaluationOut:
    m, c = e.mats_estimate, e.cost_comparison
    return EvaluationOut(
        site_id=e.status.site.id, vehicle=e.vehicle, weather_state=e.status.weather_state,
        access_call=e.status.access_call[e.vehicle], effective_status=e.status.effective_status[e.vehicle],
        mats_estimate=MatsEstimateOut(
            inputs=MatInputsOut(
                route_length=m.inputs.route_length, route_width=m.inputs.route_width,
                mat_length=m.inputs.mat_length, mat_width=m.inputs.mat_width, layers=m.inputs.layers,
                margin_min=m.inputs.margin_min, margin_max=m.inputs.margin_max,
            ),
            defaults_applied=list(m.defaults_applied),
            base_mats=m.base_mats, min_estimate=m.min_estimate, max_estimate=m.max_estimate,
            planned_quantity=m.planned_quantity,
            override=(MatOverrideOut(quantity=m.inputs.override_quantity, reason=m.inputs.override_reason)
                      if m.inputs.override_quantity is not None else None),
            mats_in_inventory=m.inputs.mats_in_inventory, shortfall=m.shortfall, unit=m.inputs.unit,
            steps=list(m.steps), method=m.method, caveat=m.caveat,
        ),
        mats_recommended=e.mats_recommended,
        cost_comparison=CostComparisonOut(
            mats_option=c.mats_option, postpone_option=c.postpone_option,
            modeled_difference=c.modeled_difference, assumptions=CostInputs(**c.assumptions),
            not_entered=list(c.not_entered), complete=c.complete, label=c.label,
        ),
        notes=list(e.notes),
    )


def reading_out(r: ReadingRecord) -> ReadingOut:
    return ReadingOut(
        device_id=r.device_id, site_id=r.site_id, seq=r.seq, raw_adc=r.raw_adc,
        moisture_index=r.moisture_index, light_raw=r.light_raw, light_index=r.light_index,
        pressure_hpa=r.pressure_hpa, temp_c=r.temp_c, calibration=r.calibration,
        recorded_at=r.recorded_at, received_at=r.received_at, mode=r.mode,
    )


def display_out(d: Display, generated_at: datetime) -> DisplayOut:
    return DisplayOut(
        device_id=d.device_id, site_id=d.site_id, effective_status=d.effective_status, code=d.code,
        lcd_line1=d.lcd_line1, lcd_line2=d.lcd_line2, alarm=d.alarm, acknowledged_at=d.acknowledged_at,
        mode=d.mode, generated_at=generated_at, vehicle=d.vehicle,
    )


def device_event_out(e: DeviceEventRecord) -> DeviceEventOut:
    return DeviceEventOut(
        id=e.id, device_id=e.device_id, site_id=e.site_id, event=e.event, seq=e.seq,
        status_at_event=e.status_at_event, recorded_at=e.recorded_at, received_at=e.received_at, mode=e.mode,
    )


def replay_out(s: DemoState) -> ReplayOut:
    return ReplayOut(
        active=s.replay_active, scenario_id=s.replay_scenario_id,
        source=s.replay_source, started_at=s.replay_started_at,
    )


def briefing_out(b: BriefingRecord) -> BriefingOut:
    return BriefingOut(
        id=b.id, generated_at=b.generated_at, mode=b.mode, summary=b.summary,
        top_priority_sites=[
            PrioritySiteOut(id=p.id, name=p.name, weather_state=p.weather_state, hazard_score=p.hazard_score,
                            effective_status=VehicleStatusOut(**p.effective_status))
            for p in b.top_priority_sites
        ],
        stop_work_site_ids=list(b.stop_work_site_ids),
        missing_data_notes=[MissingDataNoteOut(site_id=sid, missing_fields=list(f)) for sid, f in b.missing_data_notes],
        crew_report_followups=[report_out(r) for r in b.crew_report_followups],
        narrative_source=b.narrative_source,
        deterministic_summary=b.deterministic_summary,
        mat_staging=[MatStagingOut(**asdict(m)) for m in b.mat_staging],
        sources=list(b.sources),
    )


def timeline_out(t: TimelineRecord) -> TimelineEventOut:
    return TimelineEventOut(id=t.id, kind=t.kind, site_id=t.site_id, summary=t.summary, ref_id=t.ref_id, at=t.at)
