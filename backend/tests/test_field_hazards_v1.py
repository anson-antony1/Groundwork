"""Sperry PlanIT brief: lightning stop-work with a restarting 30-minute all clear, wildfire, wildlife, ML line."""
import json
from datetime import datetime, timedelta, timezone

import pytest

from backend.app.core.clock import now_utc
from backend.app.services import field_hazards, ml_index, reports, site_status
from backend.app.services.sites import load_sites
from .conftest import AUTH, TRAY


def lightning(client, site_id="DEMO-TRAY"):
    r = client.post("/api/v1/reports", data={"site_id": site_id, "description": "Strike to the west",
                                              "category_user": "lightning_observed"})
    assert r.status_code == 201
    return r.json()["data"]["id"]


def touch(client):
    return client.post(f"{TRAY}/events", headers=AUTH, json={"event": "ack_touch", "recorded_at": "2026-10-17T21:00:04-04:00"})


def site(client, site_id):
    return client.get(f"/api/v1/sites/{site_id}").json()["data"]


def test_tray_strike_stops_work_counts_down_and_touch_only_silences(client, post_reading, display):
    post_reading(10)
    lightning(client)
    d = display()
    assert d["code"] == "STOP" and d["alarm"] is True
    assert d["lcd_line2"] in ("STOP - CLR 30:00", "STOP - CLR 29:59") and len(d["lcd_line2"]) <= 16
    tray = site(client, "DEMO-TRAY")
    assert tray["weather_state"] == "STOP_WORK" and "Lightning within 10 mi" in tray["alert_events"]
    alert = next(a for a in tray["alerts"] if a["event"] == "Lightning within 10 mi")
    onset, expires = (datetime.fromisoformat(alert[k].replace("Z", "+00:00")) for k in ("onset", "expires"))
    assert expires - onset == timedelta(minutes=30) and "unverified" in alert["source"]

    assert touch(client).status_code == 201
    d = display()
    assert d["code"] == "STOP" and d["alarm"] is False and d["lcd_line2"].startswith("ACKD - CLR")
    assert site(client, "DEMO-TRAY")["weather_state"] == "STOP_WORK"  # the touch never clears STOP WORK


def test_a_new_strike_restarts_the_countdown_and_rearms_the_alarm(client, post_reading, display):
    post_reading(10)
    now = now_utc()
    reports.create_report("DEMO-TRAY", "first strike", "lightning_observed", None, now - timedelta(minutes=20))
    assert display()["lcd_line2"].endswith(("10:00", "09:59"))
    touch(client)
    assert display()["alarm"] is False
    lightning(client)
    d = display()
    assert d["alarm"] is True and d["lcd_line2"] in ("STOP - CLR 30:00", "STOP - CLR 29:59")


def test_rejected_or_expired_strikes_do_not_stop_work(client, post_reading, display):
    post_reading(10)
    rid = lightning(client)
    client.post(f"/api/v1/reports/{rid}/review", json={"verification": "rejected"})
    assert display()["code"] != "STOP"
    reports.create_report("DEMO-TRAY", "old strike", "lightning_observed", None, now_utc() - timedelta(minutes=31))
    assert display()["code"] != "STOP"
    assert "Lightning within 10 mi" not in site(client, "DEMO-TRAY")["alert_events"]


def test_strike_reaches_sites_within_ten_miles_only(client):
    by_id = {s.id: s for s in load_sites()}
    origin = by_id["SITE-007"]
    far = next(s for s in by_id.values() if s.id.startswith("SITE-")
               and field_hazards.distance_mi(origin.latitude, origin.longitude, s.latitude, s.longitude) > 15)
    lightning(client, "SITE-007")
    for sid in ("SITE-007", "SITE-008"):  # SITE-008 is 0.1 mi away
        s = site(client, sid)
        assert s["weather_state"] == "STOP_WORK" and s["effective_status"] == {"pickup": "STOP_WORK", "heavy_truck": "STOP_WORK"}
        assert any(line.startswith("Lightning:") for line in s["hazard_explanation"])
    assert "Lightning within 10 mi" not in site(client, far.id)["alert_events"]


def test_replays_show_only_historical_data(client):
    client.post("/api/v1/replay/start", json={"scenario_id": "calm-day"})
    lightning(client, "SITE-007")
    assert "Lightning within 10 mi" not in site(client, "SITE-007")["alert_events"]


def test_countdown_and_distance_helpers():
    t0 = datetime(2026, 10, 17, 21, 0, tzinfo=timezone.utc)
    bolt = field_hazards.Lightning(t0, t0 + timedelta(minutes=30), 1.0, 1, False)
    assert field_hazards.countdown(bolt, t0) == "30:00"
    assert field_hazards.countdown(bolt, t0 + timedelta(minutes=29, seconds=59, milliseconds=500)) == "00:01"
    assert field_hazards.countdown(bolt, t0 + timedelta(hours=1)) == "00:00"
    assert 94 < field_hazards.distance_mi(29.6465, -82.348, 28.5383, -81.3792) < 99  # Gainesville to Orlando, straight line


@pytest.fixture
def hazards_file(tmp_path, monkeypatch):
    path = tmp_path / "hazards_snapshot.json"
    monkeypatch.setattr(field_hazards, "HAZARDS_PATH", path)
    monkeypatch.setattr(field_hazards, "_hazards_cache", None)

    def write(sites, fetched_at=None):
        path.write_text(json.dumps({"fetched_at": (fetched_at or now_utc()).isoformat(), "sites": sites,
                                    "wildfire_reference": "https://nifc", "wildlife_reference": "https://inat"}))
    return write


def normal_site_id():
    now = now_utc()
    return next(s.site.id for s in site_status.list_statuses(now) if s.weather_state == "NORMAL" and s.site.id != "DEMO-TRAY")


def test_wildfire_nearby_raises_caution_and_wildlife_is_advisory(client, hazards_file):
    sid = normal_site_id()
    hazards_file({sid: {"wildfire": {"count": 1, "nearest_mi": 4.2, "nearest_name": "Test Fire"},
                        "wildlife": {"count": 3}}})
    s = site(client, sid)
    assert s["weather_state"] == "CAUTION" and "Active wildfire within 10 mi" in s["alert_events"]
    assert all(v != "GO_FOR_REVIEW" for v in s["effective_status"].values())
    assert any("Test Fire is 4.2 mi away" in line for line in s["hazard_explanation"])
    assert any("3 American alligator" in line for line in s["hazard_explanation"]) and s["advisories"] == []
    fire_alert = next(a for a in s["alerts"] if a["event"] == "Active wildfire within 10 mi")
    assert "Test Fire" in fire_alert["source"]
    variables = {o["variable"]: o for o in s["observations"]}
    assert variables["active_wildfires_25mi"]["value"] == 1 and variables["alligator_sightings_30d"]["value"] == 3


def test_distant_fire_or_stale_hazard_data_changes_nothing(client, hazards_file):
    sid = normal_site_id()
    hazards_file({sid: {"wildfire": {"count": 1, "nearest_mi": 18.0, "nearest_name": "Far Fire"}, "wildlife": {"count": 0}}})
    s = site(client, sid)
    assert s["weather_state"] == "NORMAL" and not any(l.startswith(("Wildfire", "Wildlife")) for l in s["hazard_explanation"])
    hazards_file({sid: {"wildfire": {"count": 1, "nearest_mi": 2.0}, "wildlife": {"count": 1}}},
                 fetched_at=now_utc() - timedelta(hours=13))
    s = site(client, sid)
    assert s["weather_state"] == "NORMAL"
    assert {o["quality"] for o in s["observations"] if o["variable"] == "active_wildfires_25mi"} == {"stale"}


def test_ml_forecast_line_appears_only_with_a_model_and_never_changes_status(client, tmp_path, monkeypatch):
    sid = normal_site_id()
    before = site(client, sid)
    assert not any(line.startswith("ML forecast") for line in before["hazard_explanation"])
    model = tmp_path / "ml_hazard_model_v1.json"
    model.write_text(json.dumps({"name": "test-logit", "trained_on": "NOAA Storm Events 2023-24",
                                 "features": ["rain_forecast", "gust_forecast"], "means": [0, 0], "scales": [1, 1],
                                 "coef": [0.0, 0.0], "intercept": 0.0, "metrics": {"auc": 0.71}}))
    monkeypatch.setattr(ml_index, "MODEL_PATH", model)
    monkeypatch.setattr(ml_index, "_cache", None)
    after = site(client, sid)
    line = next(line for line in after["hazard_explanation"] if line.startswith("ML forecast"))
    assert "5.0/10" in line and "AUC 0.71" in line
    assert after["weather_state"] == before["weather_state"] and after["hazard_score"] == before["hazard_score"]
    assert ml_index.predict({"rain_forecast": 1.0}, json.loads(model.read_text())) is None  # missing input
