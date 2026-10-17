from .conftest import AUTH, TRAY


def flag(client):
    client.post(f"{TRAY}/events", headers=AUTH,
                json={"event": "crew_flag", "recorded_at": "2026-10-16T21:00:04-04:00"})


def test_clear_crew_flag_restores_access_and_is_idempotent(client, post_reading, display):
    post_reading(10)
    flag(client)
    assert display()["code"] == "REVIEW"

    resp = client.delete(f"{TRAY}/crew-flag")
    assert resp.status_code == 200 and resp.json()["data"]["code"] == "GO"
    assert client.delete(f"{TRAY}/crew-flag").status_code == 200  # second call is a no-op
    kinds = [e["kind"] for e in client.get("/api/v1/events").json()["data"]]
    assert kinds.count("crew_flag_cleared") == 1


def test_clear_crew_flag_does_not_clear_stop_work(client, post_reading, display):
    post_reading(10)
    flag(client)
    client.post("/api/v1/replay/start")
    client.delete(f"{TRAY}/crew-flag")
    assert display()["effective_status"] == "STOP_WORK"


def test_demo_reset_requires_token(client):
    assert client.post("/api/v1/demo/reset").status_code == 401


def test_demo_reset_clears_session_but_keeps_readings_and_briefings(client, post_reading, display):
    post_reading(50)
    client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "mud"},
                files={"photo": ("x.png", b"\x89PNG\r\n\x1a\n", "image/png")})
    client.post("/api/v1/briefings/generate")
    client.post("/api/v1/replay/start")
    client.post(f"{TRAY}/events", headers=AUTH,
                json={"event": "ack_touch", "recorded_at": "2026-10-16T21:00:04-04:00"})

    body = client.post("/api/v1/demo/reset", headers=AUTH).json()["data"]
    assert body == {"replay_stopped": True, "reports_cleared": 1, "device_events_cleared": 1}

    assert client.get("/api/v1/reports").json()["pagination"]["total"] == 0
    assert client.get("/api/v1/events").json()["pagination"]["total"] == 0
    assert client.get("/api/v1/briefings").json()["pagination"]["total"] == 1
    assert display()["code"] == "MATS"  # replay ended; live reading still drives the beacon

    # Beacon is re-armed: the next STOP WORK sounds the alarm again.
    client.post("/api/v1/replay/start")
    assert display()["alarm"] is True


def test_demo_reset_removes_simulated_readings_only(client, post_reading, display):
    post_reading(50, calibration="dry_wet_2point_v1", recorded_at="2026-10-16T21:00:00-04:00")
    post_reading(90, calibration="simulated_replay_v1", mode="sensor_replay", seq=2,
                 recorded_at="2026-10-16T21:00:05-04:00")
    assert display()["code"] == "NOGO"  # the newer simulated reading drives the beacon

    client.post("/api/v1/demo/reset", headers=AUTH)

    history = client.get("/api/v1/sensors/tray-01/history").json()["data"]
    assert [r["calibration"] for r in history] == ["dry_wet_2point_v1"]
    assert display()["code"] == "MATS"  # back to the real reading
