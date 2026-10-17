"""README section 15 "Automated tests (must run)": the items no other test file covered, plus P14
(the demo path works with no network once the weather snapshot is saved).

Covered elsewhere, left where they are:
- STOP_WORK overrides MATS_FOR_REVIEW: test_api.test_no_mats_recommendation_during_stop_work, test_briefing_mats_v1
- Missing/stale -> UNKNOWN: test_hazard, test_api.test_field_sites_are_never_safe_by_default
- Pickup vs heavy truck differ: test_api.test_moisture_drives_access_per_vehicle
- Mat estimate (units, ceil, margins, defaults, inventory): test_mats, test_api.test_evaluation_mats_and_costs
- Cost math and labeled assumptions: test_cost, test_cost_labels
- Sensor POST rejects bad payload/token: test_contract
- ack_touch keeps STOP_WORK: test_api.test_stop_work_ack_silences_but_does_not_clear
- crew_flag leaves weather_state alone: test_api.test_crew_flag_never_changes_weather_state
- Bridge rejects malformed lines, never posts zeros: hardware/tests/test_serial_bridge.py
- Pressure tendency under 3 h is UNKNOWN: test_pressure_tendency_v1
- Demo reset: test_demo
"""
import json
import re
import socket
from pathlib import Path

import pytest

from backend.app.services.policies import DEMO_POLICY
from .conftest import AUTH, TRAY

ROOT = Path(__file__).resolve().parents[2]
DISPLAY_STATES = json.loads((ROOT / "fixtures" / "display_states.json").read_text(encoding="utf-8"))
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def all_sites(client):
    return client.get("/api/v1/sites", params={"limit": 500}).json()["data"]


def field_sites(client):
    return [s for s in all_sites(client) if s["id"] != "DEMO-TRAY"]


def device_event(client, event):
    return client.post(f"{TRAY}/events", headers=AUTH, json={"event": event, "recorded_at": "2026-10-16T21:00:04-04:00"})


def test_display_maps_every_status_to_the_readme_code_text_and_alarm(client, post_reading, display):
    """README 5.6 (fixtures/display_states.json): each effective status gets its code, LCD line 2 and alarm flag."""
    expected = {(d["effective_status"], d["acknowledged_at"] is not None): (d["code"], d["lcd_line2"], d["alarm"])
                for d in DISPLAY_STATES}
    limits = DEMO_POLICY["demo_tray_access"]["heavy_truck"]  # the beacon evaluates the heavy truck
    seen = set()

    def check(status, acked=False):
        d = display()
        assert d["effective_status"] == status
        assert (d["code"], d["lcd_line2"], d["alarm"]) == expected[(status, acked)]
        seen.add((status, acked))

    check("UNKNOWN")
    for seq, (moisture, status) in enumerate([(limits["go_below"] - 1, "GO_FOR_REVIEW"),
                                              (limits["go_below"], "MATS_FOR_REVIEW"),
                                              (limits["mats_below"], "NO_GO_FOR_REVIEW")], start=1):
        assert post_reading(moisture, seq=seq).status_code == 201
        check(status)
    device_event(client, "crew_flag")
    check("SUPERVISOR_REVIEW")
    client.delete(f"{TRAY}/crew-flag")
    client.post("/api/v1/replay/start")
    check("STOP_WORK")
    device_event(client, "ack_touch")
    check("STOP_WORK", acked=True)
    assert seen == set(expected)


def test_a_new_stop_work_rearms_the_alarm(client, post_reading, display):
    post_reading(10)
    client.post("/api/v1/replay/start")
    device_event(client, "ack_touch")
    assert display()["alarm"] is False
    client.post("/api/v1/replay/stop")
    client.post("/api/v1/replay/start")
    d = display()
    assert d["code"] == "STOP" and d["alarm"] is True and d["acknowledged_at"] is None


@pytest.mark.parametrize("replay", [False, True], ids=["live", "replay"])
def test_hazard_score_stays_in_range_and_alerts_are_never_averaged_away(client, replay):
    terms = DEMO_POLICY["hazard_policy"]["stop_work_alert_terms"]
    if replay:
        client.post("/api/v1/replay/start")
    sites = field_sites(client)
    stopped = 0
    for s in sites:
        if s["hazard_score"] is not None:
            assert 0 <= s["hazard_score"] <= 10, s["id"]
        if any(t in event.lower() for event in s["alert_events"] for t in terms):
            assert s["weather_state"] == "STOP_WORK", (s["id"], s["hazard_score"], s["alert_events"])
            stopped += 1
    if replay:
        assert stopped > 0  # the replay really has stop-work alerts, so the check above ran


def test_storm_replay_exit_restores_live_status_exactly(client, post_reading):
    post_reading(50)

    def state():
        return {s["id"]: (s["weather_state"], s["hazard_score"], s["access_call"], s["effective_status"], s["mode"])
                for s in all_sites(client)}

    before = state()
    client.post("/api/v1/replay/start")
    assert state() != before
    client.post("/api/v1/replay/stop")
    assert state() == before


def test_every_observation_names_its_source_fetch_time_validity_and_quality(client):
    for s in field_sites(client):
        assert s["observations"], s["id"]
        for o in s["observations"]:
            assert o["source"] and o["fetched_at"] and o["valid_at"], (s["id"], o["variable"])
            if o["value"] is None:
                assert o["quality"] in ("missing", "stale"), (s["id"], o["variable"])
            assert o["variable"] not in s["missing_fields"] or o["value"] is None


def test_fifty_plus_unique_real_coordinates_with_complete_sources(client):
    sites = field_sites(client)
    coords = {(s["latitude"], s["longitude"]) for s in sites}
    assert len(coords) >= 50
    assert all(-90 <= lat <= 90 and -180 <= lon <= 180 and (lat, lon) != (0, 0) for lat, lon in coords)
    coverage = client.get("/api/v1/coverage").json()["data"]
    assert coverage["total_sites"] == len(sites)
    assert coverage["sites_with_both"] >= 50  # sites whose weather and soil inputs are all present


def test_photo_report_shows_up_everywhere_without_an_ai_tag(client):
    """README P10: the report appears even though no AI tagger runs (it can't 'fail' the upload)."""
    r = client.post("/api/v1/reports", data={"site_id": "SITE-001", "description": "Downed limb on the access road"},
                    files={"photo": ("limb.png", PNG, "image/png")})
    assert r.status_code == 201
    report = r.json()["data"]
    assert report["image_url"] and report["category_ai"] is None and report["ai_status"] == "unavailable"
    assert report["id"] in [x["id"] for x in client.get("/api/v1/reports").json()["data"]]
    assert report["id"] in [x["id"] for x in client.get("/api/v1/sites/SITE-001").json()["data"]["reports"]]
    brief = client.post("/api/v1/briefings/generate").json()["data"]
    assert report["id"] in [x["id"] for x in brief["crew_report_followups"]]


@pytest.mark.parametrize("replay", [False, True], ids=["live", "replay"])
def test_briefing_states_stop_work_mats_reports_and_missing_data_with_real_counts(client, post_reading, replay):
    post_reading(50)  # wet tray: the heavy truck needs mats when the weather allows work
    client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "Standing water"})
    if replay:
        client.post("/api/v1/replay/start")
    sites = all_sites(client)
    b = client.post("/api/v1/briefings/generate").json()["data"]
    text = b["deterministic_summary"]
    stop = len(b["stop_work_site_ids"])
    unknown = sum(s["weather_state"] == "UNKNOWN" for s in sites)
    reports = len(b["crew_report_followups"])
    mat_sites = {m["site_id"] for m in b["mat_staging"]}

    assert f"{len(sites)} sites evaluated" in text
    assert f"{stop} under STOP WORK" in text and (stop > 0) == replay
    assert f"{unknown} have missing weather data" in text
    assert f"{reports} crew reports await review" in text and reports == 1
    if mat_sites:
        lows, highs = [m["min_estimate"] for m in b["mat_staging"]], [m["max_estimate"] for m in b["mat_staging"]]
        assert f"about {min(lows)}-{max(highs)} mats per 100 ft" in text
        assert not mat_sites & set(b["stop_work_site_ids"])
    else:
        assert "No sites need ground mats" in text
    # No invented figures: every number in the summary is one of the counts above.
    allowed = {len(sites), stop, unknown, reports, len(mat_sites), 100}
    if mat_sites:
        allowed |= {min(lows), max(highs)}
    assert {int(n) for n in re.findall(r"\d+", text)} <= allowed


@pytest.fixture
def no_network(monkeypatch):
    """Every outbound connection and DNS lookup fails, as with the venue Wi-Fi down (README P14)."""
    def refuse(*args, **kwargs):
        raise OSError("network disabled by the offline test")

    def no_dns(*args, **kwargs):
        raise socket.gaierror("network disabled by the offline test")

    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", no_dns)
    monkeypatch.setenv("GEMINI_API_KEY", "offline-test-key")  # narration tries, fails, and the template is used


def test_demo_path_works_with_no_network(client, post_reading, display, no_network, caplog):
    """README 14.4 two-minute script, offline: map, sensor, beacon, report, replay, ack, 6 PM brief."""
    ok = lambda r, code=200: r.status_code == code  # noqa: E731
    assert ok(client.get("/api/v1/health"))
    assert len(all_sites(client)) >= 51
    assert ok(client.get("/api/v1/sites/SITE-001"))
    assert ok(post_reading(50), 201)
    assert display()["code"] == "MATS"
    assert ok(client.post("/api/v1/sites/DEMO-TRAY/evaluate", json={"vehicle": "heavy_truck", "route_length": 100}))
    assert ok(client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "Standing water"},
                          files={"photo": ("p.png", PNG, "image/png")}), 201)
    assert ok(client.get("/api/v1/replay/scenarios"))
    assert ok(client.post("/api/v1/replay/start"))
    assert display()["alarm"] is True
    assert ok(device_event(client, "ack_touch"), 201)
    brief = client.post("/api/v1/briefings/generate")
    assert ok(brief, 201) and brief.json()["data"]["narrative_source"] == "deterministic_template"
    assert any("narration skipped" in r.getMessage() for r in caplog.records)  # Gemini was tried and blocked
    assert ok(client.post("/api/v1/replay/stop"))
    for path in ("/api/v1/briefings", "/api/v1/events", "/api/v1/policies", "/api/v1/coverage",
                 "/api/v1/sensors/tray-01/history", "/api/v1/sensors/tray-01/pressure-tendency"):
        assert ok(client.get(path)), path
    assert ok(client.post("/api/v1/demo/reset", headers=AUTH))
