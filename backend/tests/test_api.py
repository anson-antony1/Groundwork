"""Behavior tests following the README demo story."""
from .conftest import AUTH, TRAY

ENVELOPE_KEYS = {"data", "mode", "generated_at", "sources", "missing_fields", "errors"}
EVALUATION = {"vehicle": "heavy_truck", "route_length": 100, "route_width": 12, "mat_length": 8, "mat_width": 4}


def ack(client):
    return client.post(f"{TRAY}/events", headers=AUTH,
                       json={"event": "ack_touch", "recorded_at": "2026-10-16T21:00:04-04:00"})


def test_health_envelope(client):
    body = client.get("/api/v1/health").json()
    assert set(body) == ENVELOPE_KEYS
    assert body["data"]["status"] == "ok"


def test_field_sites_are_unknown_not_safe(client):
    sites = client.get("/api/v1/sites").json()["data"]
    assert any(s["id"] == "DEMO-TRAY" for s in sites)
    for s in sites:
        if s["id"] != "DEMO-TRAY":
            assert s["weather_state"] == "UNKNOWN" and s["hazard_score"] is None


def test_no_reading_means_unknown(display):
    assert display()["effective_status"] == "UNKNOWN"


def test_moisture_drives_access_per_vehicle(client, post_reading, display):
    assert post_reading(50).status_code == 201
    # Default demo vehicle is heavy truck: 50 is MATS for heavy, GO for pickup.
    assert display()["code"] == "MATS"
    site = client.get("/api/v1/sites/DEMO-TRAY").json()["data"]
    assert site["access_call"] == {"pickup": "GO_FOR_REVIEW", "heavy_truck": "MATS_FOR_REVIEW"}


def test_stop_work_ack_silences_but_does_not_clear(client, post_reading, display):
    post_reading(10)
    client.post("/api/v1/replay/start")
    d = display()
    assert d["effective_status"] == "STOP_WORK" and d["alarm"] is True

    ack(client)
    d = display()
    assert d["effective_status"] == "STOP_WORK" and d["alarm"] is False
    assert d["acknowledged_at"] is not None
    assert all(len(d[k]) <= 16 for k in ("lcd_line1", "lcd_line2"))

    client.post("/api/v1/replay/stop")
    assert display()["code"] == "GO"


def test_replay_start_is_idempotent_and_keeps_ack(client, post_reading, display):
    first = client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"}).json()["data"]
    ack(client)
    second = client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"}).json()["data"]
    assert first == second
    assert display()["alarm"] is False  # repeating start did not re-arm the alarm


def test_replay_stop_is_idempotent(client):
    assert client.post("/api/v1/replay/stop").status_code == 200
    assert client.post("/api/v1/replay/stop").json()["data"]["active"] is False


def test_crew_flag_never_changes_weather_state(client, post_reading):
    post_reading(10)
    client.post(f"{TRAY}/events", headers=AUTH,
                json={"event": "crew_flag", "recorded_at": "2026-10-16T21:00:04-04:00"})
    site = client.get("/api/v1/sites/DEMO-TRAY").json()["data"]
    assert site["weather_state"] == "NORMAL"
    assert site["effective_status"]["pickup"] == "SUPERVISOR_REVIEW"


def test_evaluation_mats_and_costs(client, post_reading):
    post_reading(50)
    body = client.post("/api/v1/sites/DEMO-TRAY/evaluate", json={
        **EVALUATION, "margin_min": 0.10, "margin_max": 0.25, "mats_in_inventory": 40,
        "costs": {"mats_rental": 900, "paid_idle_labor": 2800},
    }).json()["data"]
    mats = body["mats_estimate"]
    # 1200 / 32 = 37.5 -> 38 base; 38*1.10 = 41.8 -> 42; 38*1.25 = 47.5 -> 48
    assert (mats["base_mats"], mats["min_estimate"], mats["max_estimate"], mats["shortfall"]) == (38, 42, 48, 8)
    assert body["cost_comparison"]["modeled_difference"] == 1900
    assert body["mats_recommended"] is True


def test_no_mats_recommendation_during_stop_work(client, post_reading):
    post_reading(50)
    client.post("/api/v1/replay/start")
    body = client.post("/api/v1/sites/DEMO-TRAY/evaluate", json=EVALUATION).json()["data"]
    assert body["mats_recommended"] is False and body["notes"]


def test_report_without_photo_appears_in_list(client):
    r = client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "Standing water"})
    assert r.status_code == 201
    report_id = r.json()["data"]["id"]
    assert client.get(f"/api/v1/reports/{report_id}").status_code == 200
    assert client.get("/api/v1/reports").json()["pagination"]["total"] == 1


def test_report_with_png_gets_image_url(client):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    r = client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "mud"},
                    files={"photo": ("x.png", png, "image/png")})
    assert r.status_code == 201
    assert r.json()["data"]["image_url"].endswith(".png")


def test_briefing_puts_stop_work_first_and_is_retrievable(client):
    client.post("/api/v1/replay/start")
    created = client.post("/api/v1/briefings/generate")
    assert created.status_code == 201
    brief = created.json()["data"]
    assert brief["stop_work_site_ids"]
    assert brief["top_priority_sites"][0]["weather_state"] == "STOP_WORK"
    assert client.get(f"/api/v1/briefings/{brief['id']}").json()["data"] == brief


def test_timeline_records_actions(client):
    client.post("/api/v1/replay/start")
    client.post("/api/v1/replay/stop")
    kinds = [e["kind"] for e in client.get("/api/v1/events").json()["data"]]
    assert kinds == ["replay_stopped", "replay_started"]
