"""Extra site fields for the frontend: sub-scores, alert details, reasons, priority rank, per-site mode."""
from backend.app.services.site_insights import subscores, weather_triggers


def all_sites(client, **params):
    return client.get("/api/v1/sites", params={"limit": 500, **params}).json()["data"]


def field_site(sites):
    return next(s for s in sites if s["id"] != "DEMO-TRAY" and s["data_status"] in ("available", "stale"))


def test_live_site_has_subscores_reasons_and_mode(client):
    s = field_site(all_sites(client))
    sub = s["hazard_subscores"]
    assert all(sub[k] is not None for k in ("rain", "wind", "heat"))
    # rain + wind + heat are the points behind the score.
    if s["hazard_score"] is not None:
        assert abs(sub["rain"] + sub["wind"] + sub["heat"] - s["hazard_score"]) <= 0.2
    assert s["reasons"]["soil_drainage"] is not None
    assert s["mode"] in ("cached", "simulated")


def test_live_alerts_match_alert_events(client):
    for s in all_sites(client):
        assert [a["event"] for a in s["alerts"]] == s["alert_events"] or s["id"] == "DEMO-TRAY" or not s["alerts"]


def test_demo_tray_has_no_weather_insights(client):
    tray = next(s for s in all_sites(client) if s["id"] == "DEMO-TRAY")
    assert tray["hazard_subscores"] is None and tray["alerts"] == [] and tray["reasons"] is None
    assert tray["mode"] == "sensor_demo"


def test_priority_ranks_are_unique_and_match_briefing_order(client):
    sites = all_sites(client)
    ranks = sorted(s["priority_rank"] for s in sites)
    assert ranks == list(range(1, len(sites) + 1))
    by_rank = [s["id"] for s in sorted(sites, key=lambda s: s["priority_rank"])]
    brief = client.post("/api/v1/briefings/generate").json()["data"]
    assert [p["id"] for p in brief["top_priority_sites"]] == by_rank[:len(brief["top_priority_sites"])]


def test_filter_keeps_global_rank(client):
    everything = {s["id"]: s["priority_rank"] for s in all_sites(client)}
    for s in all_sites(client, weather_state="NORMAL"):
        assert s["priority_rank"] == everything[s["id"]]


def test_storm_replay_alerts_have_archived_details(client):
    client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"})
    sites = all_sites(client)
    with_alerts = [s for s in sites if s["alerts"]]
    assert with_alerts, "Milton replay should have archived alerts"
    a = with_alerts[0]["alerts"][0]
    assert a["onset"] and a["expires"] and a["reference_url"].startswith("https://mesonet.agron.iastate.edu")
    assert any(s["hazard_subscores"] and s["hazard_subscores"]["storm"] == 10.0 for s in sites)
    assert all(s["mode"] == "replay" for s in sites)


def test_subscores_unit_rules():
    values = {"rain_forecast": 25.0, "gust_forecast": 30.0, "apparent_temp": 20.0}
    assert subscores(values, []) == {"rain": 2.0, "wind": 0.0, "heat": 0.0, "flood": 0.0, "storm": 0.0}
    assert subscores(values, ["Flash Flood Warning"])["flood"] == 10.0
    assert subscores(values, None)["storm"] is None  # alert check failed: unknown, not zero
    assert subscores({}, None) is None


def test_triggers_flag_failed_alert_check():
    assert "NWS alert check unavailable" in weather_triggers({}, None)
