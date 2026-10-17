"""Wildfire/wildlife fetch: parses NIFC and iNaturalist, retries, and records failures as missing, never zero."""
import json
from datetime import datetime, timedelta, timezone

from backend.scripts import fetch_hazards_v1 as fetch, refresh_hazards_loop_v1 as loop


class Resp:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class FakeClient:
    """NIFC answers with two fires; iNaturalist fails once, then reports 4 sightings everywhere."""
    def __init__(self, nifc_ok=True):
        self.nifc_ok, self.inat_calls = nifc_ok, 0

    def get(self, url, params):
        if url == fetch.NIFC_URL:
            if not self.nifc_ok:
                raise ConnectionError("NIFC down")
            return Resp({"features": [
                {"attributes": {"IncidentName": "BIG CYPRESS"}, "geometry": {"x": -81.3792, "y": 28.5383}},
                {"attributes": {"IncidentName": "far fire"}, "geometry": {"x": -120.0, "y": 40.0}},
            ]})
        self.inat_calls += 1
        if self.inat_calls == 1:
            raise ConnectionError("429 Too Many Requests")
        return Resp({"total_results": 4, "results": []})


class Site:
    id, latitude, longitude = "S", 28.6, -81.4  # about 4.3 mi from the Orlando fire


def test_fires_near_counts_within_25_miles_and_names_the_nearest():
    fires = [{"name": "Big Cypress", "latitude": 28.5383, "longitude": -81.3792},
             {"name": "Far Fire", "latitude": 40.0, "longitude": -120.0}]
    near = fetch.fires_near(Site(), fires)
    assert near["count"] == 1 and near["nearest_name"] == "Big Cypress" and 4 < near["nearest_mi"] < 5
    assert fetch.fires_near(Site(), []) == {"count": 0, "nearest_mi": None, "nearest_name": None}


def test_build_retries_and_titles_names(monkeypatch):
    monkeypatch.setattr(fetch, "load_sites", lambda: [Site()])
    snap = fetch.build(FakeClient(), pause=0)
    entry = snap["sites"]["S"]
    assert entry["wildlife"] == {"count": 4}  # first iNaturalist call failed, the retry answered
    assert entry["wildfire"]["nearest_name"] == "Big Cypress" and entry["wildfire"]["count"] == 1
    assert snap["active_fires_nationwide"] == 2


def test_a_failed_source_is_missing_not_zero(monkeypatch):
    monkeypatch.setattr(fetch, "load_sites", lambda: [Site()])
    snap = fetch.build(FakeClient(nifc_ok=False), pause=0)
    assert snap["sites"]["S"]["wildfire"] is None and snap["active_fires_nationwide"] is None


def snapshot(fetched_at, wildfire):
    return {"fetched_at": fetched_at.isoformat(), "sites": {"S": {"wildfire": wildfire, "wildlife": {"count": 1}}}}


def test_refresh_keeps_a_fresh_previous_snapshot_over_a_worse_fetch(tmp_path, monkeypatch):
    target = tmp_path / "hazards_snapshot.json"
    now = datetime.now(timezone.utc)
    target.write_text(json.dumps(snapshot(now - timedelta(hours=1), {"count": 0, "nearest_mi": 50, "nearest_name": "x"})))
    monkeypatch.setattr(fetch, "main", lambda path: path.write_text(json.dumps(snapshot(now, None))))
    assert loop.refresh_once(target) is False
    assert json.loads(target.read_text())["sites"]["S"]["wildfire"] is not None
    assert list(tmp_path.iterdir()) == [target]

    target.write_text(json.dumps(snapshot(now - timedelta(hours=7), {"count": 0, "nearest_mi": 50, "nearest_name": "x"})))
    assert loop.refresh_once(target) is True  # the old one is too old to prefer
    assert json.loads(target.read_text())["sites"]["S"]["wildfire"] is None
