import pytest
from fastapi.testclient import TestClient

from backend.app.config import SENSOR_TOKEN
from backend.app.main import app
from backend.app.state import store

AUTH = {"Authorization": f"Bearer {SENSOR_TOKEN}"}
ENVELOPE_KEYS = {"data", "mode", "generated_at", "sources", "missing_fields", "errors"}


@pytest.fixture(autouse=True)
def client():
    store.reset()
    with TestClient(app) as c:
        yield c


def post_reading(client, moisture):
    return client.post("/api/v1/sensors/readings", headers=AUTH, json={
        "device_id": "tray-01", "site_id": "DEMO-TRAY", "seq": 1, "raw_adc": 678,
        "moisture_index": moisture, "recorded_at": "2026-10-16T21:00:00-04:00", "mode": "sensor_demo",
    })


def display(client):
    return client.get("/api/v1/devices/tray-01/display").json()


def test_health_envelope(client):
    body = client.get("/api/v1/health").json()
    assert ENVELOPE_KEYS <= body.keys()
    assert body["data"]["status"] == "ok"


def test_field_sites_are_unknown_not_safe(client):
    sites = client.get("/api/v1/sites").json()["data"]
    assert any(s["id"] == "DEMO-TRAY" for s in sites)
    for s in sites:
        if s["id"] != "DEMO-TRAY":
            assert s["weather_state"] == "UNKNOWN" and s["hazard_score"] is None


def test_reading_requires_token(client):
    r = client.post("/api/v1/sensors/readings", json={})
    assert r.status_code == 401


def test_no_reading_means_unknown(client):
    assert display(client)["effective_status"] == "UNKNOWN"


def test_moisture_drives_access_per_vehicle(client):
    assert post_reading(client, 50).status_code == 201
    # Default demo vehicle is heavy truck: 50 is MATS for heavy, GO for pickup.
    assert display(client)["code"] == "MATS"
    site = client.get("/api/v1/sites/DEMO-TRAY").json()["data"]
    assert site["access_call"] == {"pickup": "GO_FOR_REVIEW", "heavy_truck": "MATS_FOR_REVIEW"}


def test_stop_work_ack_silences_but_does_not_clear(client):
    post_reading(client, 10)
    client.post("/api/v1/replay/start")
    d = display(client)
    assert d["effective_status"] == "STOP_WORK" and d["alarm"] is True

    client.post("/api/v1/devices/tray-01/events", headers=AUTH,
                json={"event": "ack_touch", "recorded_at": "2026-10-16T21:00:04-04:00"})
    d = display(client)
    assert d["effective_status"] == "STOP_WORK" and d["alarm"] is False
    assert d["acknowledged_at"] is not None
    assert all(len(d[k]) <= 16 for k in ("lcd_line1", "lcd_line2"))

    client.post("/api/v1/replay/stop")
    assert display(client)["code"] == "GO"


def test_crew_flag_never_changes_weather_state(client):
    post_reading(client, 10)
    client.post("/api/v1/devices/tray-01/events", headers=AUTH,
                json={"event": "crew_flag", "recorded_at": "2026-10-16T21:00:04-04:00"})
    site = client.get("/api/v1/sites/DEMO-TRAY").json()["data"]
    assert site["weather_state"] == "NORMAL"
    assert site["effective_status"]["pickup"] == "SUPERVISOR_REVIEW"


def test_evaluate_mats_and_costs(client):
    post_reading(client, 50)
    body = client.post("/api/v1/sites/DEMO-TRAY/evaluate", json={
        "vehicle": "heavy_truck", "route_length": 100, "route_width": 12,
        "mat_length": 8, "mat_width": 4, "margin_min": 0.10, "margin_max": 0.25,
        "mats_in_inventory": 40, "costs": {"mats_rental": 900, "paid_idle_labor": 2800},
    }).json()["data"]
    mats = body["mats_estimate"]
    # 1200 / 32 = 37.5 -> 38 base; 38*1.10 = 41.8 -> 42; 38*1.25 = 47.5 -> 48
    assert (mats["base_mats"], mats["min_estimate"], mats["max_estimate"], mats["shortfall"]) == (38, 42, 48, 8)
    assert body["cost_comparison"]["modeled_difference"] == 1900
    assert body["mats_recommended"] is True


def test_no_mats_recommendation_during_stop_work(client):
    post_reading(client, 50)
    client.post("/api/v1/replay/start")
    body = client.post("/api/v1/sites/DEMO-TRAY/evaluate", json={
        "vehicle": "heavy_truck", "route_length": 100, "route_width": 12, "mat_length": 8, "mat_width": 4,
    }).json()["data"]
    assert body["mats_recommended"] is False and body["notes"]


def test_report_rejects_non_image(client):
    r = client.post("/api/v1/reports",
                    data={"site_id": "DEMO-TRAY", "description": "mud at gate", "category_user": "mud"},
                    files={"photo": ("x.jpg", b"not an image", "image/jpeg")})
    assert r.status_code == 415


def test_report_without_photo_appears_in_list(client):
    r = client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "Standing water"})
    assert r.status_code == 201
    assert len(client.get("/api/v1/reports").json()["data"]) == 1


def test_briefing_puts_stop_work_first(client):
    client.post("/api/v1/replay/start")
    brief = client.post("/api/v1/briefings/generate").json()["data"]
    assert brief["safety_alerts"]
    assert brief["top_priority_sites"][0]["weather_state"] == "STOP_WORK"
