"""A Florida storm replay covers the whole country honestly: every site gets its own archived day."""
from backend.app.services import site_status

from .conftest import TRAY


def site(client, site_id):
    return client.get(f"/api/v1/sites/{site_id}").json()["data"]


def test_milton_stops_florida_but_not_the_rest_of_the_country(client):
    client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"})
    assert site(client, "SITE-001")["weather_state"] == "STOP_WORK"
    sites = client.get("/api/v1/sites", params={"limit": 500}).json()["data"]
    others = [s for s in sites if s["id"].startswith("US-")]
    assert others, "nationwide sites missing"
    assert all(s["weather_state"] != "STOP_WORK" for s in others)  # 2024-10-09 was calm elsewhere
    assert all(s["hazard_explanation"][0].startswith("REPLAY") for s in others)  # replay data, not live


def test_demo_tray_still_plays_the_storm(client):
    client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"})
    d = client.get(f"{TRAY}/display").json()
    assert d["effective_status"] == "STOP_WORK" and d["alarm"] is True


def test_site_without_replay_data_is_unknown_not_stopped(client, monkeypatch):
    monkeypatch.setattr(site_status, "replay_site_v2", lambda *_: None)
    client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"})
    s = site(client, "US-001")
    assert s["weather_state"] == "UNKNOWN"
    assert s["hazard_explanation"] == [site_status.NO_REPLAY_DATA]
    assert s["alert_events"] == []
    assert set(s["effective_status"].values()) == {"UNKNOWN"}
