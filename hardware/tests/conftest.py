import sys
from pathlib import Path

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))  # hardware/ (serial_bridge, fake_beacon)
sys.path.insert(0, str(HERE.parents[2]))  # repo root (backend schemas for contract tests)
