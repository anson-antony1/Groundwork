"""GroundWork MCP server: lets an AI agent query the running API (http://localhost:8000).
Run: python agent/groundwork_mcp_v1.py   (stdio transport)"""
import httpx
from mcp.server.fastmcp import FastMCP

BASE = "http://localhost:8000/api/v1"
mcp = FastMCP("groundwork")


def _call(method: str, path: str) -> dict:
    r = httpx.request(method, f"{BASE}{path}", timeout=30)
    r.raise_for_status()
    return r.json()


def _slim(s: dict) -> dict:
    keys = ("id", "name", "weather_state", "hazard_score", "effective_status", "access_call",
            "alert_events", "hazard_explanation", "data_status", "mode")
    return {k: s.get(k) for k in keys}


@mcp.tool()
def list_sites(weather_state: str | None = None) -> list[dict]:
    """List sites with hazard score and per-vehicle status. Optional filter: NORMAL, CAUTION, STOP_WORK, UNKNOWN."""
    sites = _call("GET", "/sites")["data"]
    if weather_state:
        sites = [s for s in sites if s.get("weather_state") == weather_state.upper()]
    return [_slim(s) for s in sites]


@mcp.tool()
def get_site(site_id: str) -> dict:
    """Full status and hazard explanation for one site, e.g. SITE-001."""
    for s in _call("GET", "/sites")["data"]:
        if s.get("id") == site_id:
            return _slim(s)
    return {"error": f"site {site_id} not found"}


@mcp.tool()
def latest_briefing() -> dict:
    """The newest saved 6 PM briefing (read-only; does not generate a new one)."""
    items = _call("GET", "/briefings")["data"]
    return items[0] if items else {"error": "no briefings saved"}


@mcp.tool()
def start_storm_replay() -> dict:
    """Switch the whole system to the Hurricane Milton replay (archived real weather and real NWS alerts). Call stop_storm_replay after."""
    return _call("POST", "/replay/start")["data"]


@mcp.tool()
def stop_storm_replay() -> dict:
    """End the replay and restore live/cached state."""
    return _call("POST", "/replay/stop")["data"]


if __name__ == "__main__":
    mcp.run()
