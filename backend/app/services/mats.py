"""P8 mat staging range (README section 6): simple area method, editable inputs, supervisor override."""
from dataclasses import dataclass, replace
from math import ceil

from ..core.errors import ValidationFailedError
from .policies import MAT_DEFAULTS

CAVEAT = (
    "Early logistics estimate using a simple area method. Ignores route bends, geotechnical "
    "engineering, mat overlap geometry and mat load capacity. Not a design calculation."
)
METHOD = "base = ceil(L*W / (Ml*Mw)); planned = ceil(base * layers * (1 + margin))"
FT_PER_M = 3.28084

# Inputs that fall back to policies/mats_defaults.json when the request leaves them out.
DEFAULTABLE = ("route_width", "mat_length", "mat_width", "layers", "margin_min", "margin_max")


@dataclass(frozen=True)
class MatInputs:
    route_length: float
    route_width: float
    mat_length: float  # effective coverage per mat, after overlap
    mat_width: float
    layers: int
    margin_min: float
    margin_max: float
    mats_in_inventory: int
    unit: str
    override_quantity: int | None = None
    override_reason: str | None = None


@dataclass(frozen=True)
class MatEstimate:
    inputs: MatInputs
    defaults_applied: tuple[str, ...]
    base_mats: int
    min_estimate: int
    max_estimate: int
    planned_quantity: int  # supervisor override if given, else max_estimate
    shortfall: int
    steps: tuple[str, ...]
    method: str = METHOD
    caveat: str = CAVEAT


def resolve_inputs(vehicle: str, unit: str, provided: dict) -> tuple[MatInputs, tuple[str, ...]]:
    """Fill blank inputs from the mat defaults policy (converted to the request's unit)."""
    scale = 1 / FT_PER_M if unit == "m" and MAT_DEFAULTS["unit"] == "ft" else 1
    defaults = {
        "route_width": round(MAT_DEFAULTS["route_width"] * scale, 2),
        "mat_length": round(MAT_DEFAULTS["mat_length"] * scale, 2),
        "mat_width": round(MAT_DEFAULTS["mat_width"] * scale, 2),
        "layers": MAT_DEFAULTS["layers"][vehicle],
        "margin_min": MAT_DEFAULTS["margin_min"],
        "margin_max": MAT_DEFAULTS["margin_max"],
    }
    applied = tuple(k for k in DEFAULTABLE if provided.get(k) is None)
    values = {**provided, **{k: defaults[k] for k in applied}}
    if values["margin_min"] > values["margin_max"]:
        raise ValidationFailedError("Request validation failed.", [
            {"field": "margin_min", "issue": f"must be <= margin_max ({values['margin_max']})"}])
    return MatInputs(unit=unit, **values), applied


def _ceil(x: float) -> int:
    # Round first so float noise (40 * 1.1 = 44.000000000000004) doesn't add a phantom mat.
    return ceil(round(x, 6))


def _n(x: float) -> str:
    return f"{x:,.0f}" if float(x).is_integer() else f"{x:,.2f}".rstrip("0").rstrip(".")


def estimate_mats(m: MatInputs, defaults_applied: tuple[str, ...] = ()) -> MatEstimate:
    u = m.unit
    route_area = m.route_length * m.route_width
    mat_area = m.mat_length * m.mat_width
    base = _ceil(route_area / mat_area)
    low = _ceil(base * m.layers * (1 + m.margin_min))
    high = _ceil(base * m.layers * (1 + m.margin_max))
    planned = m.override_quantity if m.override_quantity is not None else high
    shortfall = max(0, planned - m.mats_in_inventory)

    steps = [
        f"Route area: {_n(m.route_length)} {u} x {_n(m.route_width)} {u} = {_n(route_area)} {u}2",
        f"Mat coverage: {_n(m.mat_length)} {u} x {_n(m.mat_width)} {u} = {_n(mat_area)} {u}2 per mat",
        f"Base mats: ceil({_n(route_area)} / {_n(mat_area)}) = {base}",
        f"Low estimate: ceil({base} x {m.layers} layer(s) x {_n(1 + m.margin_min)}) = {low}",
        f"High estimate: ceil({base} x {m.layers} layer(s) x {_n(1 + m.margin_max)}) = {high}",
    ]
    if m.override_quantity is not None:
        steps.append(f"Supervisor override: {planned} mats (reason: {m.override_reason})")
    steps.append(f"Shortfall: max(0, {planned} planned - {m.mats_in_inventory} in stock) = {shortfall}")

    return MatEstimate(
        inputs=m, defaults_applied=defaults_applied, base_mats=base, min_estimate=low, max_estimate=high,
        planned_quantity=planned, shortfall=shortfall, steps=tuple(steps),
    )
