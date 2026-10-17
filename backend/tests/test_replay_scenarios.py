"""GET /replay/scenarios: the frontend's scenario picker."""


def scenarios(client):
    resp = client.get("/api/v1/replay/scenarios")
    assert resp.status_code == 200
    return {s["id"]: s for s in resp.json()["data"]}


def test_lists_both_fixture_scenarios(client):
    s = scenarios(client)
    assert set(s) == {"demo-storm", "calm-day"}


def test_storm_scenario_has_real_alert_details(client):
    storm = scenarios(client)["demo-storm"]
    assert storm["title"].startswith("Hurricane Milton")
    assert "Warning" in storm["event"]  # warnings are listed first
    assert storm["reference_url"].startswith("https://mesonet.agron.iastate.edu")
    assert storm["onset"] < storm["expires"]
    assert storm["area"] == "60 sites in FL"


def test_calm_scenario_uses_fixture_label(client):
    assert scenarios(client)["calm-day"]["title"] == "Ordinary summer day (comparison)"


def test_every_listed_id_can_be_started(client):
    for scenario_id in scenarios(client):
        resp = client.post("/api/v1/replay/start", json={"scenario_id": scenario_id})
        assert resp.json()["data"]["scenario_id"] == scenario_id
        client.post("/api/v1/replay/stop")
