import json
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from ..config import DEMO_SITE_ID, FIXTURES_DIR
from ..core.errors import NotFoundError


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    latitude: float
    longitude: float
    region: str | None
    location_origin: str


class _SiteFixtureRow(BaseModel):
    """Validates fixtures/sites_50.json rows so a bad coordinate fails loudly, not on the map."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    region: str | None = None
    location_origin: str = Field(min_length=1)


DEMO_SITE = Site(
    id=DEMO_SITE_ID,
    name="Demo tray (beacon)",
    # Approximate demo venue location; the tray is a tabletop demo, not a field site.
    latitude=29.6465,
    longitude=-82.3480,
    region="Demo venue",
    location_origin="demo tray at the venue (approximate)",
)

# Inputs the hazard score needs. Until the Open-Meteo / USDA / NWS connectors exist,
# every field site reports all of these as missing (never as zero risk).
WEATHER_FIELDS = ("rain_7d", "rain_forecast", "gust_forecast", "apparent_temp", "nws_alerts", "usda_soil")


def load_sites() -> list[Site]:
    """DEMO-TRAY plus whatever is in fixtures/sites_50.json, once that file exists."""
    sites = [DEMO_SITE]
    path = FIXTURES_DIR / "sites_50.json"
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
        rows = raw["sites"] if isinstance(raw, dict) else raw
        sites.extend(Site(**_SiteFixtureRow.model_validate(row).model_dump()) for row in rows)
    return sites


def require_site(site_id: str) -> Site:
    site = next((s for s in load_sites() if s.id == site_id), None)
    if site is None:
        raise NotFoundError(f"Site '{site_id}' does not exist.", [{"field": "site_id", "issue": "unknown site"}])
    return site
