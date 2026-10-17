from math import ceil

CAVEAT = (
    "Early logistics estimate using a simple area method. Ignores route bends, geotechnical "
    "engineering, mat overlap geometry and mat load capacity. Not a design calculation."
)


def _ceil(x: float) -> int:
    # Round first so float noise (40 * 1.1 = 44.000000000000004) doesn't add a phantom mat.
    return ceil(round(x, 6))


def estimate_mats(
    route_length: float, route_width: float, mat_length: float, mat_width: float,
    layers: int, margin_min: float, margin_max: float, mats_in_inventory: int, unit: str,
) -> dict:
    base = _ceil((route_length * route_width) / (mat_length * mat_width))
    low = _ceil(base * layers * (1 + min(margin_min, margin_max)))
    high = _ceil(base * layers * (1 + max(margin_min, margin_max)))
    return {
        "base_mats": base,
        "min_estimate": low,
        "max_estimate": high,
        "mats_in_inventory": mats_in_inventory,
        "shortfall": max(0, high - mats_in_inventory),
        "unit": unit,
        "method": "base = ceil(L*W / (Ml*Mw)); planned = ceil(base * layers * (1 + margin))",
        "caveat": CAVEAT,
    }
