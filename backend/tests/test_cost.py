from backend.app.services.cost import CostAssumptions, compare_costs


def test_flat_costs_unchanged():
    r = compare_costs(CostAssumptions(mats_rental=900, paid_idle_labor=2800))
    assert r.modeled_difference == 1900


def test_hourly_items_add_to_postpone_side():
    r = compare_costs(CostAssumptions(paid_idle_labor=1000, idle_hours=8, labor_rate_per_hour=50, equipment_rate_per_hour=25))
    assert r.postpone_option == 1600
    assert r.mats_option == 0
    assert r.modeled_difference == 1600


def test_zero_hours_ignores_rates():
    r = compare_costs(CostAssumptions(labor_rate_per_hour=50, equipment_rate_per_hour=25))
    assert r.postpone_option == 0
