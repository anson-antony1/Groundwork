"""Adds the groundwork MCP server to Claude Desktop's config (macOS). Backs up the old config first."""
import json
import shutil
import sys
import time
from pathlib import Path

CONFIG = Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"
ROOT = Path(__file__).resolve().parent.parent
entry = {"command": str(ROOT / ".venv/bin/python"), "args": [str(ROOT / "agent/groundwork_mcp_v1.py")]}

CONFIG.parent.mkdir(parents=True, exist_ok=True)
cfg = {}
if CONFIG.exists():
    text = CONFIG.read_text(encoding="utf-8").strip()
    if text:
        try:
            cfg = json.loads(text)
        except json.JSONDecodeError as e:
            sys.exit(f"Existing config is not valid JSON, nothing changed: {e}")
    backup = CONFIG.with_name(f"claude_desktop_config.backup-{time.strftime('%Y%m%d-%H%M%S')}.json")
    shutil.copy2(CONFIG, backup)
    print(f"backup: {backup}")

cfg.setdefault("mcpServers", {})["groundwork"] = entry
CONFIG.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
print(f"updated {CONFIG}")
print("servers now:", ", ".join(cfg["mcpServers"]))
