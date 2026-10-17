"""6 PM brief: mentions mat needs (README section 15 test list) with sources, never plans mats under STOP WORK."""
import json

from sqlalchemy import insert

from backend.app import repositories
from backend.app.repositories.sqlite import briefing_runs_table
from backend.app.services import narration


def generate(client, monkeypatch, captured=None):
    def fake(facts):
        if captured is not None:
            captured.update(facts)
        return None  # keep the deterministic text so the test can read it
    monkeypatch.setattr(narration, "narrate", fake)
    return client.post("/api/v1/briefings/generate").json()["data"]


def test_wet_tray_puts_heavy_truck_on_the_mat_list(client, post_reading, monkeypatch):
    post_reading(50)  # heavy truck MATS, pickup GO (demo policy)
    captured = {}
    brief = generate(client, monkeypatch, captured)
    tray = [m for m in brief["mat_staging"] if m["site_id"] == "DEMO-TRAY"]
    assert [m["vehicle"] for m in tray] == ["heavy_truck"]
    m = tray[0]
    assert 0 < m["min_estimate"] <= m["max_estimate"] and (m["route_length"], m["unit"]) == (100.0, "ft")
    assert "ground mats for review" in brief["summary"] and "per 100 ft" in brief["summary"]
    assert {"vehicle": "heavy_truck", "mats_low": m["min_estimate"], "mats_high": m["max_estimate"],
            "route_length_ft": 100.0}.items() <= next(
        f for f in captured["sites_needing_mats"] if f["vehicle"] == "heavy_truck").items()
    assert any("mats_defaults" in s for s in brief["sources"])
    assert any("fetched" in s for s in brief["sources"])  # weather snapshot provenance


def test_no_mats_are_planned_under_stop_work(client, post_reading, monkeypatch):
    post_reading(50)
    client.post("/api/v1/replay/start", json={"scenario_id": "demo-storm"})
    brief = generate(client, monkeypatch)
    stopped = set(brief["stop_work_site_ids"])
    assert "DEMO-TRAY" in stopped
    assert not stopped & {m["site_id"] for m in brief["mat_staging"]}
    assert any(s.startswith("Replay:") for s in brief["sources"])


def test_mats_sentence_with_and_without_sites():
    from backend.app.repositories.records import MatStaging
    from backend.app.services.briefings import _mats_sentence

    assert _mats_sentence(()) == "No sites need ground mats for review."
    two = (MatStaging("A", "Site A", "heavy_truck", 12, 15, 100.0, "ft"),
           MatStaging("A", "Site A", "pickup", 10, 13, 100.0, "ft"))
    assert _mats_sentence(two).startswith("1 site needs ground mats for review: about 10-15 mats per 100 ft")


def test_older_saved_briefs_have_empty_lists(client):
    snapshot = {"top_priority_sites": [], "stop_work_site_ids": [], "missing_data_notes": [],
                "crew_report_followups": [], "narrative_source": "deterministic_template"}
    with repositories.briefings._engine.begin() as conn:
        conn.execute(insert(briefing_runs_table).values(
            id="brief-older", generated_at="2026-10-16T22:00:00+00:00", snapshot_json=json.dumps(snapshot),
            narrative="Old brief.", mode="cached"))
    old = client.get("/api/v1/briefings/brief-older").json()["data"]
    assert old["mat_staging"] == [] and old["sources"] == []
