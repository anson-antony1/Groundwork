"""US display units. The API, policies and scoring stay metric (Open-Meteo's native units); only text a
person reads is converted, so a threshold never shifts by a rounding step."""


def mm_to_in(mm: float) -> float:
    return mm / 25.4


def kmh_to_mph(kmh: float) -> float:
    return kmh / 1.609344


def c_to_f(c: float) -> float:
    return c * 9 / 5 + 32


def rain_text(mm: float) -> str:
    return f"{mm_to_in(mm):.2f} in"


def wind_text(kmh: float) -> str:
    return f"{kmh_to_mph(kmh):.0f} mph"


def temp_text(c: float) -> str:
    return f"{c_to_f(c):.0f} °F"
