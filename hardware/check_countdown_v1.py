#!/usr/bin/env python3
"""Watch the beacon's display endpoint and check the lightning all-clear countdown (read-only).

Sperry's PlanIT Control brief: a strike within 10 miles triggers STOP WORK with a 30-minute all-clear
countdown that restarts with each new strike. The backend owns the countdown; the beacon only shows
the display line it is given, so this checks what the beacon will get, once per poll:

  * LCD line 2 fits the beacon: at most 16 printable ASCII characters, no "|" (serial separator).
  * While a countdown shows (mm:ss on line 2), the code is STOP and nothing is green.
  * The countdown ticks down at about real-time speed, never skips forward.
  * A jump back up is reported as a restart (a new strike); the alarm should sound again then.

    python hardware/check_countdown_v1.py --api http://localhost:8000 --seconds 90
    python hardware/check_countdown_v1.py --api https://groundwork-api-hsiu.onrender.com --seconds 90

Run it next to the bridge (both only read the display); trigger a strike or a thunderstorm replay while
it watches. Exit code 0 = every check passed.
"""
from __future__ import annotations

import argparse
import re
import sys
import time

COUNTDOWN = re.compile(r"(\d{1,2}):([0-5]\d)")
DRIFT_S = 3.0  # allowed difference between countdown and wall clock over one step (polling + rounding)


def remaining(line: str) -> int | None:
    m = COUNTDOWN.search(line or "")
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def check(samples: list[tuple[float, dict]]) -> tuple[list[str], list[str]]:
    """samples: (monotonic seconds, display). Returns (problems, notes)."""
    problems: list[str] = []
    notes: list[str] = []
    last: tuple[float, int, bool] | None = None
    for t, d in samples:
        line2 = d.get("lcd_line2") or ""
        if len(line2) > 16 or any(not 32 <= ord(ch) < 127 for ch in line2) or "|" in line2:
            problems.append(f"line 2 doesn't fit the beacon: {line2!r}")
        left = remaining(line2)
        if left is None:
            last = None
            continue
        if d.get("code") != "STOP":
            problems.append(f"countdown {line2!r} shown with code {d.get('code')} (must be STOP)")
        alarm = bool(d.get("alarm"))
        if last is not None:
            t0, left0, alarm0 = last
            elapsed, dropped = t - t0, left0 - left
            if left > left0 + 1:
                notes.append(f"restart: {left0 // 60}:{left0 % 60:02d} -> {left // 60}:{left % 60:02d}"
                             + (" (alarm re-armed)" if alarm and not alarm0 else " (alarm NOT re-armed)"))
                if not alarm:
                    problems.append("countdown restarted but the alarm did not sound again")
            elif abs(dropped - elapsed) > DRIFT_S:
                problems.append(f"countdown moved {dropped} s in {elapsed:.1f} s ({line2!r})")
            if alarm0 and not alarm:
                notes.append(f"alarm acknowledged with {left // 60}:{left % 60:02d} left")
        last = (t, left, alarm)
    if not any(remaining(d.get("lcd_line2") or "") is not None for _, d in samples):
        notes.append("no countdown seen; trigger a strike or a thunderstorm replay while this runs")
    return problems, notes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--device", default="tray-01")
    ap.add_argument("--seconds", type=float, default=90)
    ap.add_argument("--interval", type=float, default=1.0)
    a = ap.parse_args(argv)
    import httpx

    url = f"{a.api.rstrip('/')}/api/v1/devices/{a.device}/display"
    samples: list[tuple[float, dict]] = []
    shown = None
    end = time.monotonic() + a.seconds
    with httpx.Client(timeout=5) as client:
        while time.monotonic() < end:
            try:
                body = client.get(url).json()
            except Exception as exc:  # noqa: BLE001 - keep watching
                print(f"poll failed: {exc}")
                time.sleep(a.interval)
                continue
            d = body.get("data", body) if isinstance(body, dict) else {}
            samples.append((time.monotonic(), d))
            line = f"{d.get('code')} | {d.get('lcd_line2')} | alarm {d.get('alarm')}"
            if line != shown:
                print(time.strftime("%H:%M:%S"), line)
                shown = line
            time.sleep(a.interval)
    problems, notes = check(samples)
    for n in notes:
        print("note:", n)
    for p in problems:
        print("FAIL:", p)
    print(f"{len(samples)} polls, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
