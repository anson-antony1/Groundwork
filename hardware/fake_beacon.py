#!/usr/bin/env python3
"""Fake Groundwork beacon: emulates the Uno firmware on a pseudo-terminal (macOS/Linux).

For developing the bridge, the backend display/event endpoints and the Sensor Lab
without the Arduino. Every line it sends carries "simulated": true, and the bridge
posts those as sensor_replay with calibration simulated_replay_v1 (the team's
"simulated" label), so this can never pass for the live tray.

  python hardware/fake_beacon.py                  # prints a port, then:
  python hardware/serial_bridge.py --port <port>

Type a key then Enter: p = pour water, d = dry tray, t = touch, f = crew flag (long press), q = quit.
Unattended: --pour-at 10 --auto-ack 3 --seconds 60

  python hardware/fake_beacon.py --write-csv /tmp/sim.csv --seconds 90 --pour-at 15 --seed 7
      # a simulated session in the bridge's recording format
"""
from __future__ import annotations

import argparse
import csv
import errno
import fcntl
import json
import math
import os
import random
import select
import sys
import time
import tty
from datetime import datetime, timedelta
from pathlib import Path

from serial_bridge import CSV_FIELDS, SIM_DRY_RAW, SIM_WET_RAW, reading_payload, simulated_calibration

STALE_AFTER = 6.0
CODES = {"GO", "MATS", "REVIEW", "NOGO", "STOP", "UNKNOWN"}
LOOK = {  # README section 5.6: backlight, red LED, green LED
    "GO": ("green", "off", "on"),
    "MATS": ("amber", "on", "on"),
    "REVIEW": ("amber", "on", "on"),
    "NOGO": ("red", "on", "off"),
    "STOP": ("red", "blinking", "off"),
    "UNKNOWN": ("white", "alternating", "alternating"),
}


class TrayModel:
    """Grove resistive probe on a 10-bit Uno input: ~210 dry, ~640 soaked."""

    DRY, WET = float(SIM_DRY_RAW), float(SIM_WET_RAW)

    def __init__(self, seed: int | None):
        self.rng = random.Random(seed)
        self.level = 0.0  # 0 dry .. 1 soaked
        self.wet = False

    def advance(self, dt: float) -> None:
        tau = 2.5 if self.wet else 120.0  # soaks fast, dries slowly
        target = 1.0 if self.wet else 0.0
        self.level += (target - self.level) * (1 - math.exp(-dt / tau))

    def reading(self, seq: int, t: float) -> dict:
        moisture = self.DRY + (self.WET - self.DRY) * self.level + self.rng.gauss(0, 3)
        return {
            "type": "reading",
            "seq": seq,
            "uptime_ms": int(t * 1000),
            "moisture_raw": int(round(min(1023, max(0, moisture)))),
            "light_raw": int(round(410 + self.rng.gauss(0, 4))),
            "pressure_hpa": round(1016.40 - 0.0005 * t + self.rng.gauss(0, 0.02), 2),
            "temp_c": round(22.8 + self.rng.gauss(0, 0.05), 1),
            "simulated": True,
        }


def write_csv(args: argparse.Namespace) -> int:
    tray = TrayModel(args.seed)
    cal = simulated_calibration()
    start = datetime.fromisoformat(args.start) if args.start else datetime.now().astimezone()
    seconds = args.seconds or 90
    path = Path(args.write_csv)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for i in range(int(seconds) + 1):
            if args.pour_at and i >= args.pour_at:
                tray.wet = True
            msg = tray.reading(i + 1, float(i))
            recorded_at = (start + timedelta(seconds=i)).isoformat(timespec="seconds")
            row = reading_payload(msg, cal, "tray-01", "DEMO-TRAY", "sensor_replay", recorded_at)
            writer.writerow({**row, "uptime_ms": msg["uptime_ms"]})
            tray.advance(1.0)
    print(f"wrote {int(seconds) + 1} simulated rows to {path}")
    return 0


class FakeBeacon:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.master, self.slave = os.openpty()
        tty.setraw(self.slave)
        fcntl.fcntl(self.master, fcntl.F_SETFL, fcntl.fcntl(self.master, fcntl.F_GETFL) | os.O_NONBLOCK)
        self.port = os.ttyname(self.slave)
        self.tray = TrayModel(args.seed)
        self.seq = 0
        self.rx = b""
        self.status = None  # (code, line1, line2, alarm)
        self.last_status = 0.0
        self.acked = False
        self.alarm_since = None
        self.shown = None

    def send(self, msg: dict) -> None:
        try:
            os.write(self.master, (json.dumps(msg) + "\r\n").encode())
        except OSError as exc:
            if exc.errno not in (errno.EAGAIN, errno.EIO):
                raise  # EAGAIN: nobody reading yet, the line is lost like on a real port

    def event(self, name: str) -> None:
        self.seq += 1
        self.send({"type": "event", "seq": self.seq, "event": name, "simulated": True})
        print(f"[beacon] sent event {name}", flush=True)

    def alarm_sounding(self, now: float) -> bool:
        return (self.status is not None and now - self.last_status <= STALE_AFTER
                and self.status[0] == "STOP" and self.status[3] and not self.acked)

    def handle(self, line: str, now: float) -> None:
        parts = line.split("|")
        if len(parts) != 5 or parts[0] != "S" or parts[1] not in CODES or parts[4] not in ("0", "1"):
            print(f"[beacon] ignored line {line!r}", flush=True)
            return
        code, line1, line2, alarm = parts[1], parts[2][:16], parts[3][:16], parts[4] == "1"
        was_alarm = self.status is not None and self.status[0] == "STOP" and self.status[3]
        if code == "STOP" and alarm and not was_alarm:
            self.acked = False  # a new STOP_WORK re-arms
            self.alarm_since = now
        self.status = (code, line1, line2, alarm)
        self.last_status = now

    def render(self, now: float) -> None:
        stale = self.status is None or now - self.last_status > STALE_AFTER
        code, line1, line2, _ = ("UNKNOWN", "NO LINK", "CHECK APP", False) if stale else self.status
        backlight, red, green = LOOK[code]
        buzzer = "PULSING" if self.alarm_sounding(now) else "off"
        shown = (line1, line2, backlight, red, green, buzzer)
        if shown != self.shown:
            print(f"[beacon] LCD {line1!r:<18} {line2!r:<18} backlight {backlight:<5} "
                  f"red {red:<11} green {green:<11} buzzer {buzzer}", flush=True)
            self.shown = shown

    def poll_serial(self, now: float) -> None:
        try:
            self.rx += os.read(self.master, 4096)
        except OSError as exc:
            if exc.errno not in (errno.EAGAIN, errno.EIO):
                raise
        *lines, self.rx = self.rx.split(b"\n")
        for raw in lines:
            self.handle(raw.decode("ascii", errors="replace").strip(), now)

    def key(self, ch: str, now: float) -> bool:
        if ch == "p":
            self.tray.wet = True
            print("[beacon] pouring water", flush=True)
        elif ch == "d":
            self.tray.wet, self.tray.level = False, 0.0
            print("[beacon] probe moved to the dry tray", flush=True)
        elif ch == "t":
            if self.alarm_sounding(now):
                self.acked = True
                self.event("ack_touch")
            else:
                print("[beacon] touch ignored (no alarm sounding)", flush=True)
        elif ch == "f":
            self.event("crew_flag")
        elif ch == "q":
            return False
        return True

    def run(self) -> int:
        print(f"fake beacon on {self.port}\n  python hardware/serial_bridge.py --port {self.port}", flush=True)
        self.send({"type": "hello", "fw": "fake_beacon/1.0", "simulated": True})
        started = last_tick = time.monotonic()
        next_reading = started
        stdin_open = True
        try:
            while not self.args.seconds or time.monotonic() - started < self.args.seconds:
                now = time.monotonic()
                self.tray.advance(now - last_tick)
                last_tick = now
                if self.args.pour_at and not self.tray.wet and now - started >= self.args.pour_at:
                    self.key("p", now)
                if now >= next_reading:
                    self.seq += 1
                    self.send(self.tray.reading(self.seq, now - started))
                    next_reading += 1.0
                self.poll_serial(now)
                if (self.args.auto_ack and self.alarm_sounding(now) and self.alarm_since is not None
                        and now - self.alarm_since >= self.args.auto_ack):
                    self.key("t", now)
                self.render(now)
                if stdin_open and select.select([sys.stdin], [], [], 0)[0]:
                    line = sys.stdin.readline()
                    if not line:
                        stdin_open = False
                    elif line.strip() and not self.key(line.strip()[0].lower(), now):
                        break
                time.sleep(0.02)
        except KeyboardInterrupt:
            pass
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pour-at", type=float, default=0, help="auto-pour after N seconds (0 = press p)")
    parser.add_argument("--auto-ack", type=float, default=0, help="auto-touch N seconds after an alarm starts")
    parser.add_argument("--seconds", type=float, default=0, help="stop after N seconds (0 = run until q)")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--write-csv", metavar="PATH", help="write a simulated session CSV and exit")
    parser.add_argument("--start", help="--write-csv: first timestamp, ISO 8601 with offset")
    args = parser.parse_args()
    if args.write_csv:
        return write_csv(args)
    return FakeBeacon(args).run()


if __name__ == "__main__":
    sys.exit(main())
