"""P10: supervisor review of crew reports (POST /reports/{id}/review)."""


def new_report(client, category="mud"):
    r = client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "Soft ground", "category_user": category})
    return r.json()["data"]["id"]


def test_confirm_report(client):
    rid = new_report(client)
    resp = client.post(f"/api/v1/reports/{rid}/review", json={"verification": "confirmed"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["verification"] == "confirmed" and data["category_user"] == "mud"
    assert client.get(f"/api/v1/reports/{rid}").json()["data"]["verification"] == "confirmed"  # persisted


def test_confirm_with_corrected_category(client):
    rid = new_report(client, "other")
    data = client.post(f"/api/v1/reports/{rid}/review",
                       json={"verification": "confirmed", "category_user": "standing_water"}).json()["data"]
    assert data["category_user"] == "standing_water"


def test_reject_and_timeline_entry(client):
    rid = new_report(client)
    client.post(f"/api/v1/reports/{rid}/review", json={"verification": "rejected"})
    events = client.get("/api/v1/events").json()["data"]
    assert events[0]["kind"] == "report_reviewed" and events[0]["ref_id"] == rid


def test_reviewed_reports_leave_briefing_followups(client):
    rid = new_report(client)
    client.post(f"/api/v1/reports/{rid}/review", json={"verification": "confirmed"})
    brief = client.post("/api/v1/briefings/generate").json()["data"]
    assert all(r["id"] != rid for r in brief["crew_report_followups"])


def test_unknown_report_is_404(client):
    assert client.post("/api/v1/reports/nope/review", json={"verification": "confirmed"}).status_code == 404


def test_invalid_verification_is_422(client):
    rid = new_report(client)
    resp = client.post(f"/api/v1/reports/{rid}/review", json={"verification": "unreviewed"})
    assert resp.status_code == 422
