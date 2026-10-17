"""P8 mat staging range: defaults, worked steps, supervisor override, units."""
URL = "/api/v1/sites/DEMO-TRAY/evaluate"


def mats(client, **body):
    resp = client.post(URL, json={"route_length": 100, **body})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["mats_estimate"]


def test_blank_inputs_use_policy_defaults(client):
    m = mats(client)
    # Defaults: 12 ft route width, 14 x 8 ft mats, 1 layer, 10-25% margin.
    assert m["defaults_applied"] == ["route_width", "mat_length", "mat_width", "layers", "margin_min", "margin_max"]
    assert m["inputs"]["route_width"] == 12 and m["inputs"]["mat_length"] == 14
    # 1200 / 112 = 10.7 -> 11 base; 11*1.10 = 12.1 -> 13; 11*1.25 = 13.75 -> 14
    assert (m["base_mats"], m["min_estimate"], m["max_estimate"], m["planned_quantity"]) == (11, 13, 14, 14)


def test_explicit_inputs_are_not_reported_as_defaults(client):
    m = mats(client, route_width=10, mat_length=8, mat_width=4, layers=2, margin_min=0, margin_max=0)
    assert m["defaults_applied"] == []
    assert m["base_mats"] == 32 and m["max_estimate"] == 64


def test_steps_show_the_calculation_with_numbers(client):
    steps = mats(client, mats_in_inventory=5)["steps"]
    assert steps[0] == "Route area: 100 ft x 12 ft = 1,200 ft2"
    assert steps[2] == "Base mats: ceil(1,200 / 112) = 11"
    assert steps[-1] == "Shortfall: max(0, 14 planned - 5 in stock) = 9"


def test_override_sets_planned_quantity_and_shortfall(client):
    m = mats(client, mats_in_inventory=5, override_quantity=20, override_reason="soft spot near gate")
    assert m["planned_quantity"] == 20 and m["shortfall"] == 15
    assert m["override"] == {"quantity": 20, "reason": "soft spot near gate"}
    assert m["max_estimate"] == 14  # the calculated range is still shown


def test_override_requires_reason(client):
    resp = client.post(URL, json={"route_length": 100, "override_quantity": 20})
    assert resp.status_code == 422


def test_metric_defaults_are_converted(client):
    m = mats(client, unit="m", route_length=30)
    assert m["unit"] == "m" and m["inputs"]["mat_length"] == 4.27  # 14 ft


def test_bad_margin_order_after_defaults_is_422(client):
    resp = client.post(URL, json={"route_length": 100, "margin_min": 0.5})  # default max is 0.25
    assert resp.status_code == 422
    assert resp.json()["error"]["details"][0]["field"] == "margin_min"


def test_mat_defaults_exposed_in_policies(client):
    d = client.get("/api/v1/policies").json()["data"]["mat_defaults"]
    assert d["unit"] == "ft" and d["layers"] == {"pickup": 1, "heavy_truck": 1}
