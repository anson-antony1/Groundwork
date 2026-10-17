"""P9: blank cost inputs count as $0 but are labeled, so a forgotten cost can't silently tip the comparison."""
URL = "/api/v1/sites/DEMO-TRAY/evaluate"
ALL_ITEMS = ["mats_rental", "delivery", "installation", "removal", "delay_not_prevented",
             "idle_labor", "idle_equipment", "rescheduling", "extra_contract_cost"]


def costs(client, **c):
    resp = client.post(URL, json={"route_length": 100, "costs": c})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["cost_comparison"]


def test_nothing_entered_lists_every_item(client):
    c = costs(client)
    assert c["not_entered"] == ALL_ITEMS and c["complete"] is False
    assert c["modeled_difference"] == 0
    assert "count as $0" in c["label"]


def test_typed_zero_is_an_entry_not_a_blank(client):
    c = costs(client, delivery=0)
    assert "delivery" not in c["not_entered"]


def test_blank_is_reported_as_null_in_assumptions(client):
    c = costs(client, mats_rental=900)
    assert c["assumptions"]["mats_rental"] == 900 and c["assumptions"]["rescheduling"] is None


def test_hourly_rates_cover_labor_and_equipment(client):
    c = costs(client, idle_hours=6, labor_rate_per_hour=180, equipment_rate_per_hour=50)
    assert "idle_labor" not in c["not_entered"] and "idle_equipment" not in c["not_entered"]
    assert c["postpone_option"] == 6 * (180 + 50)


def test_hours_without_a_rate_do_not_count_as_entered(client):
    c = costs(client, idle_hours=6, labor_rate_per_hour=180)
    assert "idle_labor" not in c["not_entered"] and "idle_equipment" in c["not_entered"]


def test_all_items_entered_is_complete(client):
    c = costs(client, mats_rental=900, delivery=100, installation=200, removal=150, delay_not_prevented=0,
              paid_idle_labor=1800, idle_equipment=400, rescheduling=300, extra_contract_cost=0)
    assert c["not_entered"] == [] and c["complete"] is True
    assert c["modeled_difference"] == (1800 + 400 + 300) - (900 + 100 + 200 + 150)


def test_old_style_request_still_works(client):
    """Clients that send every field as a number (e.g. the current frontend) keep working."""
    c = costs(client, **{k: 0 for k in ("mats_rental", "delivery", "installation", "removal", "delay_not_prevented",
                                        "paid_idle_labor", "idle_equipment", "rescheduling", "extra_contract_cost")})
    assert c["complete"] is True
