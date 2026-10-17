#!/usr/bin/env python3
"""Groundwork serial bridge: Arduino beacon <-USB serial-> bridge <-HTTP-> FastAPI.

Reads JSON lines from the beacon, validates them, stamps recorded_at (the Uno has
no clock), applies the dry/wet calibration, posts readings and events to the API,
polls the beacon's display state and writes S|... status lines back to the Uno.

  python hardware/serial_bridge.py --port auto --api http://localhost:8000 --device tray-01
  python hardware/serial_bridge.py --replay fixtures/sensor_replay.csv      # no hardware
  python hardware/serial_bridge.py --list-ports
  python hardware/serial_bridge.py --port auto --monitor                    # print lines, no API
  python hardware/serial_bridge.py --port auto --demo-states                # test firmware, no backend
  python hardware/serial_bridge.py --port auto --calibrate moisture-dry     # also: moisture-wet,
                                                                            #   light-dark, light-bright, show
Owner: Anson. Protocol: README section 5.7; API contract: section 5.8.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import statistics
import sys
import time
import unicodedata
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DEFAULT_CALIBRATION = HERE / "calibration.json"
DEFAULT_RECORDINGS = HERE / "recordings"
DISPLAY_STATES = ROOT / "fixtures" / "display_states.json"
# Recordings use the API's field names: a superset of fixtures/sensor_replay.csv, so a good
# run can replace the fallback for both this bridge and replay_sensor_v2.py.
CSV_FIELDS = ["recorded_at", "seq", "uptime_ms", "raw_adc", "moisture_index", "light_raw", "light_index",
              "pressure_hpa", "temp_c", "calibration", "mode"]
REPLAY_VALUES = ("raw_adc", "moisture_index", "light_raw", "light_index", "pressure_hpa", "temp_c")
# Team convention for simulated data: the API only knows sensor_demo / sensor_replay, and the UI
# keys its "simulated" label off this calibration name.
SIMULATED_CALIBRATION = "simulated_replay_v1"
SIM_DRY_RAW, SIM_WET_RAW = 210, 640  # hardware/fake_beacon.py probe model
ADC_MAX = 1023  # Uno 10-bit analog inputs
EVENTS = {"ack_touch", "crew_flag"}
STATUS_CODES = {
    "GO_FOR_REVIEW": "GO",
    "MATS_FOR_REVIEW": "MATS",
    "SUPERVISOR_REVIEW": "REVIEW",
    "NO_GO_FOR_REVIEW": "NOGO",
    "STOP_WORK": "STOP",
    "UNKNOWN": "UNKNOWN",
}
NO_SERVER_LINE = "S|UNKNOWN|NO SERVER|CHECK APP|0"
HEARTBEAT_SECONDS = 2.0


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def log(message: str) -> None:
    print(f"{datetime.now():%H:%M:%S} {message}", flush=True)


# ---------------------------------------------------------------------------
# Serial line validation. Anything malformed is rejected, never "fixed".
# ---------------------------------------------------------------------------


class LineError(ValueError):
    pass


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value) -> bool:
    return (_is_int(value) or isinstance(value, float)) and math.isfinite(value)


READING_RANGES = {
    "moisture_raw": (0, ADC_MAX, True),
    "light_raw": (0, ADC_MAX, True),
    "pressure_hpa": (300.0, 1100.0, False),  # station pressure; 0 means a broken read
    "temp_c": (-40.0, 85.0, False),
}


def validate_reading(msg: dict) -> dict:
    for key in ("seq", "uptime_ms"):
        if not _is_int(msg.get(key)) or msg[key] < 0:
            raise LineError(f"reading needs non-negative integer {key}")
    clean = {"type": "reading", "seq": msg["seq"], "uptime_ms": msg["uptime_ms"]}
    for key, (low, high, integer) in READING_RANGES.items():
        if key not in msg:
            continue  # module not connected: stays absent
        value = msg[key]
        if not (_is_int(value) if integer else _is_number(value)):
            raise LineError(f"{key} must be {'an integer' if integer else 'a number'}, got {value!r}")
        if not low <= value <= high:
            raise LineError(f"{key}={value} outside {low}..{high}")
        clean[key] = value
    if len(clean) == 3:
        raise LineError("reading has no sensor values")
    if msg.get("simulated") is True:  # set by hardware/fake_beacon.py
        clean["simulated"] = True
    return clean


def parse_line(text: str) -> Optional[dict]:
    """Return a validated message, None for a blank line, or raise LineError."""
    text = text.strip()
    if not text:
        return None
    try:
        msg = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LineError(f"not JSON: {text[:60]!r}") from exc
    if not isinstance(msg, dict):
        raise LineError("not a JSON object")
    kind = msg.get("type")
    if kind == "reading":
        return validate_reading(msg)
    if kind == "event":
        if msg.get("event") not in EVENTS:
            raise LineError(f"unknown event {msg.get('event')!r}")
        if not _is_int(msg.get("seq")) or msg["seq"] < 0:
            raise LineError("event needs non-negative integer seq")
        event = {"type": "event", "event": msg["event"], "seq": msg["seq"]}
        if msg.get("simulated") is True:
            event["simulated"] = True
        return event
    if kind == "hello":
        return msg
    raise LineError(f"unknown message type {kind!r}")


# ---------------------------------------------------------------------------
# Display state -> S|CODE|line1|line2|alarm
# ---------------------------------------------------------------------------


def lcd_text(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    text = "".join(ch for ch in text if 0x20 <= ord(ch) <= 0x7E and ch != "|")
    return text[:16]


def status_line(display: dict) -> str:
    code = display.get("code")
    if code not in STATUS_CODES.values():
        code = STATUS_CODES.get(display.get("effective_status"), "UNKNOWN")
    alarm = "1" if display.get("alarm") is True and code == "STOP" else "0"
    return f"S|{code}|{lcd_text(display.get('lcd_line1'))}|{lcd_text(display.get('lcd_line2'))}|{alarm}"


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------

CALIBRATION_NAME = "dry_wet_2point_v1"
POINTS = {"moisture": ("dry", "wet"), "light": ("dark", "bright")}


def empty_calibration() -> dict:
    cal = {"name": CALIBRATION_NAME, "adc_max": ADC_MAX}
    for channel, (zero, full) in POINTS.items():
        cal[channel] = {f"{zero}_raw": None, f"{full}_raw": None,
                        f"{zero}_measured_at": None, f"{full}_measured_at": None}
    return cal


def simulated_calibration() -> dict:
    """The fake beacon's probe model is calibrated by definition."""
    cal = empty_calibration()
    cal["name"] = SIMULATED_CALIBRATION
    cal["moisture"].update(dry_raw=SIM_DRY_RAW, wet_raw=SIM_WET_RAW)
    cal["light"].update(dark_raw=0, bright_raw=ADC_MAX)
    return cal


def load_calibration(path: Path) -> dict:
    cal = empty_calibration()
    if path.exists():
        saved = json.loads(path.read_text())
        for channel in POINTS:
            cal[channel].update(saved.get(channel) or {})
    return cal


def is_calibrated(cal: dict, channel: str) -> bool:
    zero_key, full_key = POINTS[channel]
    zero, full = cal[channel].get(f"{zero_key}_raw"), cal[channel].get(f"{full_key}_raw")
    return zero is not None and full is not None and zero != full


def channel_index(cal: dict, channel: str, raw: float) -> Optional[float]:
    """0 at the zero point (dry/dark), 100 at the full point (wet/bright), clamped.
    None when not calibrated: an uncalibrated index is omitted, never guessed."""
    if not is_calibrated(cal, channel):
        return None
    zero_key, full_key = POINTS[channel]
    zero, full = cal[channel][f"{zero_key}_raw"], cal[channel][f"{full_key}_raw"]
    return round(min(100.0, max(0.0, (raw - zero) / (full - zero) * 100.0)), 1)


def calibration_summary(cal: dict) -> str:
    parts = []
    for channel, (zero, full) in POINTS.items():
        z, f = cal[channel].get(f"{zero}_raw"), cal[channel].get(f"{full}_raw")
        if z is None or f is None:
            parts.append(f"{channel}: not calibrated ({zero}={z}, {full}={f})")
        else:
            span = abs(f - z)
            parts.append(f"{channel}: {zero}={z:g} {full}={f:g} (span {span:g} = {span / ADC_MAX:.0%} of range)")
    return "; ".join(parts)


def reading_payload(msg: dict, cal: dict, device_id: str, site_id: str, mode: str, recorded_at: str) -> dict:
    """POST body for /api/v1/sensors/readings. The API rejects unknown fields, so nothing extra goes in."""
    payload = {"device_id": device_id, "site_id": site_id, "seq": msg["seq"]}
    if "moisture_raw" in msg:
        payload["raw_adc"] = msg["moisture_raw"]
        index = channel_index(cal, "moisture", msg["moisture_raw"])
        if index is not None:
            payload["moisture_index"] = index
    if "light_raw" in msg:
        payload["light_raw"] = msg["light_raw"]
        index = channel_index(cal, "light", msg["light_raw"])
        if index is not None:
            payload["light_index"] = index
    for key in ("pressure_hpa", "temp_c"):
        if key in msg:
            payload[key] = msg[key]
    payload["calibration"] = cal["name"] if is_calibrated(cal, "moisture") else "uncalibrated"
    payload["recorded_at"] = recorded_at
    payload["mode"] = mode
    return payload


# ---------------------------------------------------------------------------
# HTTP client with offline queueing
# ---------------------------------------------------------------------------


class Api:
    """Posts readings (newest first, so the dashboard stays live) and events
    (oldest first, none dropped unless the server rejects them). After a
    network failure it backs off instead of blocking the serial loop."""

    def __init__(self, base_url: str, token: str, device_id: str, timeout: float = 1.5):
        import httpx

        self._httpx = httpx
        self.base_url = base_url.rstrip("/")
        self.device_id = device_id
        self.client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Authorization": f"Bearer {token}", "User-Agent": "groundwork-bridge/1.0"},
        )
        self.readings: deque[dict] = deque(maxlen=600)
        self.events: deque[dict] = deque(maxlen=200)
        self.sent = 0
        self.rejected = 0
        self.down_until = 0.0
        self.backoff = 0.0
        self._last_logged: dict[str, float] = {}

    def _log_once(self, key: str, message: str, every: float = 5.0) -> None:
        now = time.monotonic()
        if now - self._last_logged.get(key, -every) >= every:
            log(message)
            self._last_logged[key] = now

    @property
    def available(self) -> bool:
        return time.monotonic() >= self.down_until

    def _network_failed(self, exc: Exception) -> None:
        self.backoff = min(5.0, max(1.0, self.backoff * 2))
        self.down_until = time.monotonic() + self.backoff
        self._log_once("net", f"API unreachable at {self.base_url} ({exc.__class__.__name__}); "
                              f"queueing, retry in {self.backoff:g}s")

    def _post(self, path: str, body: dict) -> str:
        try:
            response = self.client.post(path, json=body)
        except self._httpx.HTTPError as exc:
            self._network_failed(exc)
            return "retry"
        self.backoff = 0.0
        if response.status_code < 300:
            self.sent += 1
            return "ok"
        if response.status_code < 500:
            hint = " (GROUNDWORK_SENSOR_TOKEN differs from the backend)" if response.status_code == 401 else ""
            self._log_once(f"http{response.status_code}",
                           f"API rejected {path}: HTTP {response.status_code}{hint} {response.text[:200]}")
            self.rejected += 1
            return "rejected"
        self._log_once("http5xx", f"API error HTTP {response.status_code} on {path}; will retry")
        self.down_until = time.monotonic() + 1.0
        return "retry"

    def submit_reading(self, payload: dict) -> str:
        if not self.available:
            self.readings.append(payload)
            return "queued"
        status = self._post("/api/v1/sensors/readings", payload)
        if status == "retry":
            self.readings.append(payload)
            return "queued"
        if status == "ok":
            self.flush()
        return status

    def submit_event(self, payload: dict) -> str:
        self.events.append(payload)
        self.flush()
        return "queued" if payload in self.events else "sent"

    def flush(self, budget: int = 20) -> None:
        path = f"/api/v1/devices/{self.device_id}/events"
        while self.events and self.available:
            if self._post(path, self.events[0]) == "retry":
                return
            self.events.popleft()
        while self.readings and self.available and budget > 0:
            if self._post("/api/v1/sensors/readings", self.readings[0]) == "retry":
                return
            self.readings.popleft()
            budget -= 1

    def display(self) -> Optional[dict]:
        if not self.available:
            return None
        try:
            response = self.client.get(f"/api/v1/devices/{self.device_id}/display")
        except self._httpx.HTTPError as exc:
            self._network_failed(exc)
            return None
        if response.status_code != 200:
            self._log_once("display", f"display endpoint returned HTTP {response.status_code}")
            # Server is up but has no status for us: say so on the LCD.
            return {"code": "UNKNOWN", "lcd_line1": "NO STATUS", "lcd_line2": f"HTTP {response.status_code}",
                    "alarm": False}
        body = response.json()
        data = body.get("data") if isinstance(body.get("data"), dict) else body
        return data if isinstance(data, dict) else None

    def health(self) -> Optional[dict]:
        try:
            return self.client.get("/api/v1/health").json()
        except Exception:  # noqa: BLE001 - advisory only
            return None


# ---------------------------------------------------------------------------
# Serial link
# ---------------------------------------------------------------------------


def find_port() -> str:
    from serial.tools import list_ports

    candidates = []
    for port in list_ports.comports():
        name = port.device
        arduino_vid = port.vid in (0x2341, 0x2A03, 0x1A86, 0x0403, 0x10C4)
        if arduino_vid or any(s in name for s in ("usbmodem", "usbserial", "ttyACM", "ttyUSB")):
            candidates.append(name)
    # macOS lists each device as /dev/cu.* and /dev/tty.*; cu does not wait for carrier.
    candidates.sort(key=lambda n: (not n.startswith("/dev/cu."), n))
    if not candidates:
        raise SystemExit("no Arduino serial port found; plug in the USB-B cable or pass --port (see --list-ports)")
    return candidates[0]


class SerialLink:
    def __init__(self, port: str, baud: int = 115200, reset_wait: float = 2.0):
        import serial

        self.port = find_port() if port == "auto" else port
        try:
            self.serial = serial.Serial(self.port, baud, timeout=0)
        except serial.SerialException as exc:
            raise SystemExit(f"cannot open {self.port}: {exc}. Close the Arduino IDE Serial Monitor; "
                             "only one program can hold the port.") from exc
        time.sleep(reset_wait)  # opening the port resets the Uno
        self.serial.reset_input_buffer()
        self._buffer = b""

    def read_lines(self) -> list[str]:
        waiting = self.serial.in_waiting
        if waiting:
            self._buffer += self.serial.read(waiting)
        if len(self._buffer) > 4096 and b"\n" not in self._buffer:
            self._buffer = b""  # garbage with no line breaks
        *lines, self._buffer = self._buffer.split(b"\n")
        return [line.decode("utf-8", errors="replace").rstrip("\r") for line in lines]

    def write_line(self, line: str) -> None:
        self.serial.write((line + "\n").encode("ascii", errors="replace"))

    def close(self) -> None:
        self.serial.close()


# ---------------------------------------------------------------------------
# Replay and recording
# ---------------------------------------------------------------------------


def load_replay(path: Path) -> list[dict]:
    """Rows of fixtures/sensor_replay.csv (seq, values, calibration) or of a bridge recording
    (the same plus recorded_at). Values replay exactly as recorded, with their calibration label,
    so simulated rows (calibration simulated_replay_v1) stay labeled simulated."""
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise SystemExit(f"{path} has no rows")
    if not set(REPLAY_VALUES) & set(rows[0]):
        raise SystemExit(f"{path} has none of the value columns {', '.join(REPLAY_VALUES)}")
    timed = all(row.get("recorded_at") for row in rows)
    parsed = []
    for number, row in enumerate(rows, start=2):
        try:
            values = {key: float(row[key]) for key in REPLAY_VALUES if row.get(key) not in (None, "")}
            t = datetime.fromisoformat(row["recorded_at"].replace("Z", "+00:00")) if timed else None
        except ValueError as exc:
            raise SystemExit(f"{path}:{number}: {exc}") from exc
        if not values:
            raise SystemExit(f"{path}:{number}: row has no values")
        parsed.append({"values": values, "calibration": row.get("calibration") or "uncalibrated", "t": t})
    return parsed


def replay_payload(row: dict, seq: int, device_id: str, site_id: str) -> dict:
    return {"device_id": device_id, "site_id": site_id, "seq": seq, **row["values"],
            "calibration": row["calibration"], "recorded_at": now_iso(), "mode": "sensor_replay"}


class ReplaySource:
    """Paces rows by their recorded_at when every row has one, otherwise every `interval` seconds."""

    def __init__(self, rows: list[dict], speed: float, loop: bool, interval: float = 1.0):
        self.rows, self.speed, self.loop, self.interval = rows, speed, loop, interval
        self.index = 0
        self.started = time.monotonic()
        self.finished = False

    def _offset(self, index: int) -> float:
        first, row = self.rows[0], self.rows[index]
        if row["t"] is not None and first["t"] is not None:
            return (row["t"] - first["t"]).total_seconds() / self.speed
        return index * self.interval / self.speed

    def due(self, now: float) -> Iterator[dict]:
        while not self.finished:
            row = self.rows[self.index]
            if now < self.started + self._offset(self.index):
                return
            yield row
            self.index += 1
            if self.index == len(self.rows):
                if self.loop:
                    self.index, self.started = 0, now
                else:
                    self.finished = True


class Recorder:
    """Writes every posted board reading to recordings/<device>-<time>.csv (CSV_FIELDS)."""

    def __init__(self, directory: Path, device_id: str):
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / f"{device_id}-{datetime.now():%Y%m%d-%H%M%S}.csv"
        self._file = self.path.open("w", newline="")
        self._writer = csv.DictWriter(self._file, fieldnames=CSV_FIELDS, extrasaction="ignore")
        self._writer.writeheader()

    def write(self, payload: dict, uptime_ms: Optional[int] = None) -> None:
        self._writer.writerow({**payload, "uptime_ms": uptime_ms})
        self._file.flush()

    def close(self) -> None:
        self._file.close()


# ---------------------------------------------------------------------------
# Bridge loop
# ---------------------------------------------------------------------------


class Bridge:
    def __init__(self, args: argparse.Namespace, api: Api, link: Optional[SerialLink],
                 replay: Optional[ReplaySource], recorder: Optional[Recorder], cal: dict):
        self.args, self.api, self.link, self.replay, self.recorder, self.cal = args, api, link, replay, recorder, cal
        self.last_line: Optional[str] = None
        self.last_write = 0.0
        self.next_display = 0.0
        self.last_seq: Optional[int] = None
        self.last_uptime: Optional[int] = None
        self.rejected_lines = 0
        self.dropped_lines = 0
        self.replay_seq = 0

    def _check_sequence(self, msg: dict) -> None:
        if self.last_uptime is not None and msg.get("uptime_ms", self.last_uptime) < self.last_uptime:
            log("beacon reset detected (uptime went backwards)")
        elif self.last_seq is not None and msg["seq"] > self.last_seq + 1:
            self.dropped_lines += msg["seq"] - self.last_seq - 1
            log(f"{msg['seq'] - self.last_seq - 1} serial line(s) dropped before seq {msg['seq']}")
        self.last_seq = msg["seq"]
        self.last_uptime = msg.get("uptime_ms", self.last_uptime)

    def _submit(self, payload: dict) -> None:
        status = self.api.submit_reading(payload)
        shown = ("raw_adc", "moisture_index", "light_raw", "pressure_hpa", "temp_c")
        values = " ".join(f"{k} {payload[k]:g}" for k in shown if k in payload)
        queued = f" (backlog {len(self.api.readings)})" if self.api.readings else ""
        log(f"seq {payload['seq']:>5} {values} [{payload['mode']}, {payload['calibration']}] -> {status}{queued}")

    def handle_serial_line(self, text: str) -> None:
        try:
            msg = parse_line(text)
        except LineError as exc:
            self.rejected_lines += 1
            log(f"rejected serial line: {exc}")
            return
        if msg is None:
            return
        if msg["type"] == "hello":
            log(f"beacon says hello: {json.dumps(msg)}")
            self.last_seq = self.last_uptime = None
            return
        self._check_sequence(msg)
        # Board lines are live even while a replay feeds readings. The fake beacon flags its
        # lines; they post as sensor_replay + simulated_replay_v1 so the UI calls them simulated.
        simulated = bool(msg.get("simulated"))
        mode = "sensor_replay" if simulated else "sensor_demo"
        if msg["type"] == "event":
            payload = {"event": msg["event"], "seq": msg["seq"], "recorded_at": now_iso(), "mode": mode}
            log(f"beacon event {msg['event']} -> {self.api.submit_event(payload)}")
            self.next_display = 0.0  # show the server's reaction right away
            return
        if self.replay:
            return  # replay supplies the readings; the board only drives display and events
        cal = simulated_calibration() if simulated else self.cal
        payload = reading_payload(msg, cal, self.args.device, self.args.site, mode, now_iso())
        if self.recorder:
            self.recorder.write(payload, msg["uptime_ms"])
        self._submit(payload)

    def step(self, now: float) -> None:
        if self.link:
            for text in self.link.read_lines():
                self.handle_serial_line(text)
        if self.replay:
            for row in self.replay.due(now):
                self.replay_seq += 1
                self._submit(replay_payload(row, self.replay_seq, self.args.device, self.args.site))
        if self.api.available and (self.api.readings or self.api.events):
            self.api.flush()
        if self.link and now >= self.next_display:
            self.next_display = now + self.args.display_interval
            display = self.api.display()
            line = status_line(display) if display else NO_SERVER_LINE
            if line != self.last_line or now - self.last_write >= HEARTBEAT_SECONDS:
                self.link.write_line(line)
                if line != self.last_line:
                    log(f"beacon <- {line}")
                self.last_line, self.last_write = line, now

    def run(self) -> None:
        while not (self.replay and self.replay.finished and not self.link):
            self.step(time.monotonic())
            time.sleep(0.02)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_bridge(args: argparse.Namespace) -> int:
    if not args.port and not args.replay:
        raise SystemExit("pass --port (live beacon) or --replay CSV (no hardware); see --help")
    cal = load_calibration(Path(args.calibration))
    log(f"calibration: {calibration_summary(cal)}")
    if not is_calibrated(cal, "moisture") and not args.replay:
        log("warning: moisture not calibrated, so moisture_index is omitted (raw is still sent). "
            "Run --calibrate moisture-dry and moisture-wet.")
    api = Api(args.api, args.token, args.device)
    health = api.health()
    log(f"API {'ok' if health else 'NOT reachable'} at {args.api}")
    replay = None
    if args.replay:
        if not 0 < args.interval <= 10:
            raise SystemExit("--interval must be 0-10 s: the backend treats readings older than 15 s as stale")
        rows = load_replay(Path(args.replay))
        replay = ReplaySource(rows, args.speed, args.loop, args.interval)
        labels = ", ".join(sorted({row["calibration"] for row in rows}))
        log(f"replaying {len(rows)} rows from {args.replay} as sensor_replay (calibration {labels})"
            + (" looping" if args.loop else "") + ("; keep --loop on so readings stay fresh" if not args.loop else ""))
    link = SerialLink(args.port) if args.port else None
    if link:
        log(f"beacon on {link.port}")
    recorder = Recorder(Path(args.log_dir), args.device) if link and not replay and not args.no_record else None
    if recorder:
        log(f"recording to {recorder.path}")
    bridge = Bridge(args, api, link, replay, recorder, cal)
    try:
        bridge.run()
    except KeyboardInterrupt:
        pass
    finally:
        if link:
            link.close()
        if recorder:
            recorder.close()
    log(f"done: sent {api.sent}, rejected {api.rejected}, unsent readings {len(api.readings)}, "
        f"unsent events {len(api.events)}, bad serial lines {bridge.rejected_lines}, dropped {bridge.dropped_lines}")
    return 0


def cmd_monitor(args: argparse.Namespace) -> int:
    cal = load_calibration(Path(args.calibration))
    link = SerialLink(args.port)
    log(f"monitoring {link.port} (Ctrl-C to stop)")
    try:
        while True:
            for text in link.read_lines():
                try:
                    msg = parse_line(text)
                except LineError as exc:
                    log(f"BAD  {text!r}: {exc}")
                    continue
                if msg is None:
                    continue
                extra = ""
                if msg["type"] == "reading" and "moisture_raw" in msg:
                    index = channel_index(cal, "moisture", msg["moisture_raw"])
                    extra = f"  -> moisture_index {index}" if index is not None else "  (moisture not calibrated)"
                log(f"OK   {json.dumps(msg)}{extra}")
            time.sleep(0.02)
    except KeyboardInterrupt:
        return 0
    finally:
        link.close()


def cmd_demo_states(args: argparse.Namespace) -> int:
    doc = json.loads(DISPLAY_STATES.read_text())
    states = doc["data"] if isinstance(doc, dict) else doc
    link = SerialLink(args.port)
    log(f"cycling {len(states)} display states on {link.port} every {args.state_seconds:g}s (no backend)")
    index, changed, last_write = 0, time.monotonic(), 0.0
    try:
        while True:
            now = time.monotonic()
            if now - changed >= args.state_seconds:
                index, changed = (index + 1) % len(states), now
                last_write = 0.0
            if now - last_write >= HEARTBEAT_SECONDS:
                line = status_line(states[index])
                if last_write == 0.0:
                    log(f"beacon <- {line}")
                link.write_line(line)
                last_write = now
            for text in link.read_lines():
                if '"event"' in text:
                    log(f"beacon event: {text.strip()}")
            time.sleep(0.02)
    except KeyboardInterrupt:
        return 0
    finally:
        link.close()


def cmd_calibrate(args: argparse.Namespace) -> int:
    path = Path(args.calibration)
    cal = load_calibration(path)
    if args.calibrate == "show":
        print(f"{path}: {calibration_summary(cal)}")
        return 0
    channel, point = args.calibrate.split("-")
    key = f"{channel}_raw"
    hint = {"dry": "in DRY soil", "wet": "in SOAKED soil", "dark": "COVERED (dark)", "bright": "under room/phone light"}
    link = SerialLink(args.port)
    log(f"Put the {channel} sensor {hint[point]}. Collecting {args.samples} readings...")
    values: list[int] = []
    try:
        while len(values) < args.samples:
            for text in link.read_lines():
                try:
                    msg = parse_line(text)
                except LineError:
                    continue
                if msg and msg["type"] == "reading" and key in msg:
                    values.append(msg[key])
                    print(f"  {len(values):>2}/{args.samples}: {msg[key]}", flush=True)
            time.sleep(0.02)
    finally:
        link.close()
    median = float(statistics.median(values))
    spread = statistics.pstdev(values)
    cal[channel][f"{point}_raw"] = median
    cal[channel][f"{point}_measured_at"] = now_iso()
    path.write_text(json.dumps(cal, indent=2) + "\n")
    log(f"{channel} {point} = {median:g} (min {min(values)}, max {max(values)}, stdev {spread:.1f}); saved {path}")
    if spread > 0.03 * ADC_MAX:
        log("warning: noisy readings; check the Grove cable and keep the sensor still")
    zero, full = POINTS[channel]
    z, f = cal[channel][f"{zero}_raw"], cal[channel][f"{full}_raw"]
    if z is not None and f is not None and abs(f - z) < 0.10 * ADC_MAX:
        log("warning: the two points are close together, so the index will be jumpy")
    print(calibration_summary(cal))
    return 0


def cmd_list_ports(_: argparse.Namespace) -> int:
    from serial.tools import list_ports

    for port in list_ports.comports():
        vid = f"{port.vid:04x}:{port.pid:04x}" if port.vid is not None else "-"
        print(f"{port.device:<28} {vid:<10} {port.description}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    env = os.environ.get
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", help="serial port, or 'auto' (macOS /dev/cu.usbmodem*, Linux /dev/ttyACM0)")
    parser.add_argument("--api", default=env("GROUNDWORK_API", "http://localhost:8000"))
    parser.add_argument("--token", default=env("GROUNDWORK_SENSOR_TOKEN", "dev-sensor-token"),
                        help="sensor token; must match the backend (env GROUNDWORK_SENSOR_TOKEN)")
    parser.add_argument("--device", default="tray-01")
    parser.add_argument("--site", default="DEMO-TRAY")
    parser.add_argument("--calibration", default=str(DEFAULT_CALIBRATION))
    parser.add_argument("--display-interval", type=float, default=1.0, help="seconds between display polls")
    parser.add_argument("--log-dir", default=str(DEFAULT_RECORDINGS))
    parser.add_argument("--no-record", action="store_true", help="do not write a CSV of live readings")
    parser.add_argument("--replay", metavar="CSV", help="stream a recording instead of live readings")
    parser.add_argument("--speed", type=float, default=1.0, help="replay speed multiplier")
    parser.add_argument("--interval", type=float, default=1.0,
                        help="replay seconds per row when the CSV has no recorded_at (max 10)")
    parser.add_argument("--loop", action="store_true", help="loop the replay")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--list-ports", action="store_true")
    mode.add_argument("--monitor", action="store_true", help="print validated serial lines; no API")
    mode.add_argument("--demo-states", action="store_true", help="cycle fixtures/display_states.json; no API")
    mode.add_argument("--calibrate", choices=["moisture-dry", "moisture-wet", "light-dark", "light-bright", "show"])
    parser.add_argument("--state-seconds", type=float, default=5.0, help="--demo-states: seconds per state")
    parser.add_argument("--samples", type=int, default=10, help="--calibrate: readings to collect")
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.list_ports:
        return cmd_list_ports(args)
    if args.calibrate == "show":
        return cmd_calibrate(args)
    if (args.monitor or args.demo_states or args.calibrate) and not args.port:
        raise SystemExit("this mode needs --port (or --port auto)")
    if args.monitor:
        return cmd_monitor(args)
    if args.demo_states:
        return cmd_demo_states(args)
    if args.calibrate:
        return cmd_calibrate(args)
    return cmd_bridge(args)


if __name__ == "__main__":
    sys.exit(main())
