"""Low-light advisory on the demo site (README section 4): advisory only, never changes a status."""


def tray(client):
    return client.get("/api/v1/sites/DEMO-TRAY").json()["data"]


def test_dim_reading_adds_advisory(client, post_reading):
    post_reading(10, light_index=12)
    advisories = tray(client)["advisories"]
    assert len(advisories) == 1 and "Low light" in advisories[0] and "12/100" in advisories[0]


def test_bright_reading_has_no_advisory(client, post_reading):
    post_reading(10, light_index=80)
    assert tray(client)["advisories"] == []


def test_no_light_sensor_means_no_note(client, post_reading):
    post_reading(10)  # light module not connected: field omitted, never guessed
    assert tray(client)["advisories"] == []


def test_low_light_never_changes_status(client, post_reading, display):
    post_reading(10, light_index=80)
    bright = (tray(client)["effective_status"], display()["code"])
    post_reading(10, light_index=5, seq=2)
    assert (tray(client)["effective_status"], display()["code"]) == bright


def test_replayed_reading_is_labeled_recorded(client, post_reading):
    post_reading(10, light_index=5, mode="sensor_replay")
    assert "(recorded demo)" in tray(client)["advisories"][0]


def test_field_sites_have_no_light_advisory(client, post_reading):
    post_reading(10, light_index=5)
    sites = client.get("/api/v1/sites", params={"limit": 500}).json()["data"]
    assert all(s["advisories"] == [] for s in sites if s["id"] != "DEMO-TRAY")


def test_threshold_exposed_in_policies(client):
    assert client.get("/api/v1/policies").json()["data"]["low_light_index_below"] == 25
