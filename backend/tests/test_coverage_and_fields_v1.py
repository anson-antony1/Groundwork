"""Judge-facing coverage/freshness metrics, and the small proposed.ts fields (ai_status, display vehicle)."""
from datetime import timedelta

from .conftest import TRAY


def test_coverage_counts_add_up(client):
    d = client.get("/api/v1/coverage").json()["data"]
    assert d["total_sites"] >= 50
    assert d["sites_with_both"] <= min(d["sites_with_weather"], d["sites_with_usda_soil"])
    assert d["sites_with_both"] + d["sites_with_missing"] == d["total_sites"]  # fully covered, or something missing
    sources = {f["source"] for f in d["freshness"]}
    assert {"Open-Meteo", "NWS", "USDA NRCS Soil Data Access"} <= sources
    for f in d["freshness"]:
        assert f["oldest_fetched_at"] <= f["median_fetched_at"] <= f["newest_fetched_at"]


def test_coverage_flags_stale_sources(client, monkeypatch):
    monkeypatch.setattr("backend.app.api.health.STALE_AFTER", timedelta(seconds=-1))
    assert all(f["stale"] for f in client.get("/api/v1/coverage").json()["data"]["freshness"])


def test_reports_say_the_ai_tagger_is_unavailable(client):
    r = client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "Standing water"})
    assert r.json()["data"]["ai_status"] == "unavailable"


def test_display_names_its_vehicle(client):
    d = client.get(f"{TRAY}/display").json()
    assert d["vehicle"] in ("pickup", "heavy_truck")
    assert d["lcd_line1"].endswith("HVY" if d["vehicle"] == "heavy_truck" else "PKP")
