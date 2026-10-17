"""Fields from frontend/src/api/proposed.ts that the UI already renders when present."""
import json

from sqlalchemy import insert

from backend.app import repositories
from backend.app.repositories.sqlite import briefing_runs_table
from backend.app.services import narration
from backend.app.services.hazard import HAZARD_POLICY


def all_sites(client, **params):
    return client.get("/api/v1/sites", params={"limit": 500, **params}).json()["data"]


def test_priority_rank_is_global_unique_and_matches_the_briefing(client):
    sites = all_sites(client)
    ranks = sorted(s["priority_rank"] for s in sites)
    assert ranks == list(range(1, len(sites) + 1))

    brief = client.post("/api/v1/briefings/generate").json()["data"]
    by_rank = [s["id"] for s in sorted(sites, key=lambda s: s["priority_rank"])]
    assert [p["id"] for p in brief["top_priority_sites"]] == by_rank[:len(brief["top_priority_sites"])]


def test_filtered_list_keeps_global_ranks(client):
    client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"})
    everything = {s["id"]: s["priority_rank"] for s in all_sites(client)}
    stopped = all_sites(client, weather_state="STOP_WORK")
    assert stopped and all(s["priority_rank"] == everything[s["id"]] for s in stopped)
    assert max(s["priority_rank"] for s in stopped) == len(stopped)  # STOP WORK ranks first


def test_site_detail_rank_matches_the_list(client):
    ranks = {s["id"]: s["priority_rank"] for s in all_sites(client)}
    assert client.get("/api/v1/sites/SITE-001").json()["data"]["priority_rank"] == ranks["SITE-001"]


def test_template_briefing_reports_itself(client, monkeypatch):
    monkeypatch.setattr(narration, "narrate", lambda facts: None)
    brief = client.post("/api/v1/briefings/generate").json()["data"]
    assert brief["narrative_source"] == "deterministic_template"
    assert brief["deterministic_summary"] == brief["summary"]


def test_llm_briefing_keeps_the_template_text(client, monkeypatch):
    monkeypatch.setattr(narration, "narrate", lambda facts: "Gemini says: stage mats at the Duval site.")
    created = client.post("/api/v1/briefings/generate").json()["data"]
    assert created["narrative_source"] == "llm"
    assert created["summary"].startswith("Gemini says")
    assert "sites evaluated" in created["deterministic_summary"]
    saved = client.get(f"/api/v1/briefings/{created['id']}").json()["data"]
    assert saved["deterministic_summary"] == created["deterministic_summary"]


def test_briefings_saved_before_this_field_still_load(client):
    snapshot = {"top_priority_sites": [], "stop_work_site_ids": [], "missing_data_notes": [],
                "crew_report_followups": [], "narrative_source": "llm"}
    with repositories.briefings._engine.begin() as conn:
        conn.execute(insert(briefing_runs_table).values(
            id="brief-old", generated_at="2026-10-16T22:00:00+00:00", snapshot_json=json.dumps(snapshot),
            narrative="An older Gemini brief.", mode="cached"))
    old = client.get("/api/v1/briefings/brief-old").json()["data"]
    assert old["summary"] == "An older Gemini brief." and old["deterministic_summary"] is None


def test_policies_describe_the_live_hazard_rules(client):
    p = client.get("/api/v1/policies").json()["data"]
    w = p["hazard_weights"]
    assert (w["rain"], w["wind"], w["heat"]) == (HAZARD_POLICY["rain_forecast_max_pts"] / 10,
                                                 HAZARD_POLICY["gust_max_pts"] / 10,
                                                 HAZARD_POLICY["heat_max_pts"] / 10)
    assert abs(sum(w.values()) - 1.0) < 1e-9
    assert p["hazard_policy"]["stop_work_from"] == HAZARD_POLICY["stop_work_from"]
    assert "tornado" in p["hazard_policy"]["stop_work_alert_terms"]
