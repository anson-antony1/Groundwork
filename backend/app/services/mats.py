from dataclasses import dataclass
from math import ceil

CAVEAT = (
    "Early logistics estimate using a simple area method. Ignores route bends, geotechnical "
    "engineering, mat overlap geometry and mat load capacity. Not a design calculation."
)
METHOD = "base = ceil(L*W / (Ml*Mw)); planned = ceil(base * layers * (1 + margin))"


@dataclass(frozen=True)
class MatInputs:
    route_length: float
    route_width: float
    mat_length: float
    mat_width: float
    layers: int
    margin_min: float
    margin_max: float
    mats_in_inventory: int
    unit: str


@dataclass(frozen=True)
class MatEstimate:
    base_mats: int
    min_estimate: int
    max_estimate: int
    mats_in_inventory: int
    shortfall: int
    unit: str
    method: str = METHOD
    caveat: str = CAVEAT


def _ceil(x: float) -> int:
    # Round first so float noise (40 * 1.1 = 44.000000000000004) doesn't add a phantom mat.
    return ceil(round(x, 6))


def estimate_mats(m: MatInputs) -> MatEstimate:
    base = _ceil((m.route_length * m.route_width) / (m.mat_length * m.mat_width))
    high = _ceil(base * m.layers * (1 + m.margin_max))
    return MatEstimate(
        base_mats=base,
        min_estimate=_ceil(base * m.layers * (1 + m.margin_min)),
        max_estimate=high,
        mats_in_inventory=m.mats_in_inventory,
        shortfall=max(0, high - m.mats_in_inventory),
        unit=m.unit,
    )
