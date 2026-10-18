from __future__ import annotations

import json
import os
import sys
import threading
import time
import tty
from argparse import Namespace
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

import serial_bridge as sb

FIXTURE_CSV = Path(__file__).resolve().parents[2] / "fixtures" / "sensor_replay.csv"


# --- serial line validation --------------------------------------------------

def test_parses_full_and_partial_readings():
    full = sb.parse_line('{"type":"reading","seq":412,"uptime_ms":412003,"moisture_raw":678,'
                         '"light_raw":402,"pressure_hpa":1012.84,"temp_c":24.6}\r')
    assert full == {"type": "reading", "seq": 412, "uptime_ms": 412003, "moisture_raw": 678,
                    "light_raw": 402, "pressure_hpa": 1012.84, "temp_c": 24.6}
    partial = sb.parse_line('{"type":"reading","seq":1,"uptime_ms":10,"moisture_raw":0}')
    assert "light_raw" not in partial and partial["moisture_raw"] == 0
    assert sb.parse_line("   ") is None
    assert sb.parse_line('{"type":"event","seq":5,"event":"ack_touch"}')["event"] == "ack_touch"


@pytest.mark.parametrize("line", [
    "garbage from boot",
    "[1, 2]",
    '{"type":"status"}',
    '{"type":"reading","seq":true,"uptime_ms":1,"moisture_raw":5}',
    '{"type":"reading","seq":-1,"uptime_ms":1,"moisture_raw":5}',
    '{"type":"reading","seq":1,"uptime_ms":1,"moisture_raw":1024}',
    '{"type":"reading","seq":1,"uptime_ms":1,"moisture_raw":5.5}',
    '{"type":"reading","seq":1,"uptime_ms":1,"pressure_hpa":0}',
    '{"type":"reading","seq":1,"uptime_ms":1,"pressure_hpa":NaN}',
    '{"type":"reading","seq":1,"uptime_ms":1}',
    '{"type":"event","seq":1,"event":"clear_stop"}',
])
def test_rejects_malformed_lines(line):
    with pytest.raises(sb.LineError):
        sb.parse_line(line)


# --- display -> S line --------------------------------------------------------

def test_status_line_from_display():
    display = {"code": "STOP", "lcd_line1": "DEMO TRAY", "lcd_line2": "STOP WORK - ACK?", "alarm": True}
    assert sb.status_line(display) == "S|STOP|DEMO TRAY|STOP WORK - ACK?|1"


def test_status_line_sanitizes_and_never_alarms_outside_stop():
    display = {"effective_status": "MATS_FOR_REVIEW", "lcd_line1": "Café|tray — très long text",
               "lcd_line2": None, "alarm": True}
    line = sb.status_line(display)
    code, l1, l2, alarm = line.split("|")[1:]
    assert code == "MATS" and alarm == "0" and l2 == ""
    assert l1.isascii() and len(l1) <= 16 and l1.startswith("Cafetray")


def test_display_fixture_states_all_become_valid_lines():
    doc = json.loads(sb.DISPLAY_STATES.read_text())
    states = doc["data"] if isinstance(doc, dict) else doc
    for state in states:
        parts = sb.status_line(state).split("|")
        assert len(parts) == 5 and parts[1] in sb.STATUS_CODES.values()


# --- calibration and payloads ------------------------------------------------

def calibrated(dry=210, wet=640, dark=None, bright=None):
    cal = sb.empty_calibration()
    cal["moisture"].update(dry_raw=dry, wet_raw=wet)
    cal["light"].update(dark_raw=dark, bright_raw=bright)
    return cal


def test_index_works_in_both_probe_directions():
    assert sb.channel_index(calibrated(210, 640), "moisture", 425) == 50.0
    assert sb.channel_index(calibrated(800, 300), "moisture", 550) == 50.0  # capacitive: lower = wetter
    assert sb.channel_index(calibrated(210, 640), "moisture", 900) == 100.0
    assert sb.channel_index(sb.empty_calibration(), "moisture", 425) is None


def test_payload_omits_uncalibrated_indexes_and_missing_modules():
    msg = sb.parse_line('{"type":"reading","seq":7,"uptime_ms":7000,"moisture_raw":425,"light_raw":300}')
    p = sb.reading_payload(msg, sb.empty_calibration(), "tray-01", "DEMO-TRAY", "sensor_demo", "T")
    assert p["raw_adc"] == 425 and p["light_raw"] == 300
    assert "moisture_index" not in p and "light_index" not in p and "pressure_hpa" not in p
    assert p["calibration"] == "uncalibrated"
    p = sb.reading_payload(msg, calibrated(), "tray-01", "DEMO-TRAY", "sensor_demo", "T")
    assert p["moisture_index"] == 50.0 and p["calibration"] == "dry_wet_2point_v1"


# --- replay -------------------------------------------------------------------

def test_team_fixture_replays_with_its_simulated_label():
    rows = sb.load_replay(FIXTURE_CSV)
    assert {r["calibration"] for r in rows} == {sb.SIMULATED_CALIBRATION}
    payload = sb.replay_payload(rows[0], 1, "tray-01", "DEMO-TRAY")
    assert payload["mode"] == "sensor_replay" and payload["calibration"] == sb.SIMULATED_CALIBRATION


def test_untimed_replay_paces_by_interval():
    source = sb.ReplaySource(sb.load_replay(FIXTURE_CSV)[:5], speed=1.0, loop=False, interval=2.0)
    start = source.started
    assert len(list(source.due(start))) == 1
    assert len(list(source.due(start + 2.1))) == 1
    list(source.due(start + 60))
    assert source.finished


def test_recording_replays_by_timestamp(tmp_path):
    import fake_beacon

    out = tmp_path / "sim.csv"
    sys.argv = ["fake_beacon.py", "--write-csv", str(out), "--seconds", "4", "--seed", "1",
                "--start", "2026-10-16T21:00:00-04:00"]
    assert fake_beacon.main() == 0
    rows = sb.load_replay(out)
    assert len(rows) == 5 and {r["calibration"] for r in rows} == {sb.SIMULATED_CALIBRATION}
    source = sb.ReplaySource(rows, speed=10.0, loop=False, interval=5.0)  # timestamps win over interval
    assert len(list(source.due(source.started + 0.25))) == 3


def test_payloads_match_the_backend_contract():
    """The API rejects unknown fields (extra=forbid), so validate against its real request models."""
    from backend.app.schemas.requests import DeviceEventIn, SensorReadingIn

    msg = sb.parse_line('{"type":"reading","seq":9,"uptime_ms":9000,"moisture_raw":425,"light_raw":300,'
                        '"pressure_hpa":1012.5,"temp_c":24.1}')
    for cal, mode in ((sb.empty_calibration(), "sensor_demo"), (calibrated(dark=0, bright=1023), "sensor_demo"),
                      (sb.simulated_calibration(), "sensor_replay")):
        SensorReadingIn(**sb.reading_payload(msg, cal, "tray-01", "DEMO-TRAY", mode, sb.now_iso()))
    SensorReadingIn(**sb.replay_payload(sb.load_replay(FIXTURE_CSV)[0], 1, "tray-01", "DEMO-TRAY"))
    DeviceEventIn(event="ack_touch", seq=1, recorded_at=sb.now_iso(), mode="sensor_demo")


# --- HTTP ---------------------------------------------------------------------

class FakeApi(BaseHTTPRequestHandler):
    posts: list = []
    display_status = 200
    display = {"code": "STOP", "lcd_line1": "DEMO TRAY", "lcd_line2": "STOP WORK - ACK?", "alarm": True}

    def _reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        type(self).posts.append((self.path, self.headers["Authorization"], body))
        ok = self.headers["Authorization"] == "Bearer good"
        self._reply(201 if ok else 401, {"detail": "ok" if ok else "bad token"})

    def do_GET(self):
        if self.path.endswith("/display"):
            self._reply(type(self).display_status, {"data": type(self).display, "mode": "live"})
        else:
            self._reply(200, {"data": {"status": "ok"}})

    def log_message(self, *args):
        pass


@pytest.fixture()
def api_url():
    FakeApi.posts = []
    FakeApi.display_status = 200
    httpd = HTTPServer(("127.0.0.1", 0), FakeApi)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()


def test_api_sends_bearer_token_and_drops_rejected(api_url):
    assert sb.Api(api_url, "good", "tray-01").submit_reading({"n": 1}) == "ok"
    assert FakeApi.posts[0][:2] == ("/api/v1/sensors/readings", "Bearer good")
    api = sb.Api(api_url, "bad", "tray-01")
    assert api.submit_reading({"n": 2}) == "rejected"
    assert not api.readings


class FakeAuth0:
    """Stands in for https://<tenant>/oauth/token: counts calls, can fail, hands out numbered tokens."""

    def __init__(self, fail=False, expires_in=3600):
        self.calls, self.fail, self.expires_in = [], fail, expires_in

    def post(self, url, json):
        self.calls.append((url, json))
        if self.fail:
            raise ConnectionError("Auth0 unreachable")
        return FakeResponse({"access_token": f"machine-{len(self.calls)}", "expires_in": self.expires_in, "token_type": "Bearer"})


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self.body


def test_machine_token_uses_client_credentials_and_caches_until_near_expiry():
    clock = [1000.0]
    auth0 = FakeAuth0(expires_in=600)
    machine = sb.MachineToken("groundwork.us.auth0.com", "cid", "shh", "https://groundwork-api", client=auth0, clock=lambda: clock[0])
    assert machine.get() == "machine-1"
    url, body = auth0.calls[0]
    assert url == "https://groundwork.us.auth0.com/oauth/token"
    assert body == {"grant_type": "client_credentials", "client_id": "cid", "client_secret": "shh", "audience": "https://groundwork-api"}
    clock[0] += 500  # 100 s left: still cached
    assert machine.get() == "machine-1" and len(auth0.calls) == 1
    clock[0] += 50  # under a minute left: renewed early
    assert machine.get() == "machine-2"


def test_machine_token_failure_falls_back_and_waits_before_retrying():
    clock = [0.0]
    auth0 = FakeAuth0(fail=True)
    machine = sb.MachineToken("t.auth0.com", "cid", "shh", "aud", client=auth0, clock=lambda: clock[0])
    assert machine.get() is None
    assert machine.get() is None and len(auth0.calls) == 1  # no hammering Auth0
    clock[0] += 31
    auth0.fail = False
    assert machine.get() == "machine-2"


def test_api_sends_the_machine_token_and_falls_back_to_the_sensor_token(api_url):
    machine = sb.MachineToken("t.auth0.com", "cid", "shh", "aud", client=FakeAuth0())
    sb.Api(api_url, "good", "tray-01", machine=machine).submit_reading({"n": 1})
    assert FakeApi.posts[-1][1] == "Bearer machine-1"
    down = sb.MachineToken("t.auth0.com", "cid", "shh", "aud", client=FakeAuth0(fail=True))
    assert sb.Api(api_url, "good", "tray-01", machine=down).submit_reading({"n": 2}) == "ok"
    assert FakeApi.posts[-1][1] == "Bearer good"


def test_api_queues_offline_then_sends_newest_reading_first(api_url):
    api = sb.Api("http://127.0.0.1:9", "good", "tray-01", timeout=0.5)
    assert api.submit_reading({"n": 1}) == "queued"
    assert api.submit_event({"event": "ack_touch", "seq": 1}) == "queued"
    assert api.submit_reading({"n": 2}) == "queued"
    api.client.base_url = api_url
    api.down_until = 0
    assert api.submit_reading({"n": 3}) == "ok"
    sent = [(path.rsplit("/", 1)[-1], body.get("n", body.get("event"))) for path, _, body in FakeApi.posts]
    assert sent == [("readings", 3), ("events", "ack_touch"), ("readings", 1), ("readings", 2)]
    assert not api.readings and not api.events


def test_display_unwraps_envelope_and_reports_http_errors(api_url):
    api = sb.Api(api_url, "good", "tray-01")
    assert api.display()["code"] == "STOP"
    FakeApi.display_status = 501
    assert sb.status_line(api.display()) == "S|UNKNOWN|NO STATUS|HTTP 501|0"


# --- full bridge over a pseudo-terminal ---------------------------------------

@pytest.mark.skipif(sys.platform == "win32", reason="needs a POSIX pty")
def test_bridge_end_to_end_over_pty(api_url, tmp_path):
    master, slave = os.openpty()
    tty.setraw(slave)
    link = sb.SerialLink(os.ttyname(slave), reset_wait=0)
    args = Namespace(device="tray-01", site="DEMO-TRAY", display_interval=1.0)
    recorder = sb.Recorder(tmp_path, "tray-01")
    bridge = sb.Bridge(args, sb.Api(api_url, "good", "tray-01"), link, None, recorder, calibrated())

    os.write(master, b'{"type":"reading","seq":1,"uptime_ms":1000,"moisture_raw":425}\r\n')
    os.write(master, b"not json\r\n")
    os.write(master, b'{"type":"event","seq":2,"event":"ack_touch"}\r\n')
    os.write(master, b'{"type":"reading","seq":3,"uptime_ms":2000,"moisture_raw":430,"simulated":true}\r\n')
    deadline = time.monotonic() + 3
    while len(FakeApi.posts) < 3 and time.monotonic() < deadline:
        bridge.step(time.monotonic())
        time.sleep(0.02)

    bodies = [body for _, _, body in FakeApi.posts]
    assert bodies[0]["moisture_index"] == 50.0 and bodies[0]["mode"] == "sensor_demo"
    assert bodies[1]["event"] == "ack_touch"
    # Fake beacon data is never labeled live.
    assert (bodies[2]["mode"], bodies[2]["calibration"]) == ("sensor_replay", sb.SIMULATED_CALIBRATION)
    assert bridge.rejected_lines == 1
    assert os.read(master, 4096).decode().startswith("S|STOP|DEMO TRAY|STOP WORK - ACK?|1\n")
    recorder.close()
    assert len(recorder.path.read_text().strip().splitlines()) == 3  # header + 2 readings
    link.close()
    os.close(master)


# --- rehearsal latency (README section 15) ------------------------------------

GO, MATS = "S|GO|DEMO TRAY   HVY|GO FOR REVIEW|0", "S|MATS|DEMO TRAY   HVY|MATS FOR REVIEW|0"
STOP, ACKD = "S|STOP|DEMO TRAY   HVY|STOP WORK - ACK?|1", "S|STOP|DEMO TRAY   HVY|STOP WORK - ACKD|0"


def test_latency_times_moisture_changes_from_the_newest_reading():
    lat = sb.Latency()
    lat.reading_at = 10.0
    assert lat.changed(GO, MATS, 10.8) == "800 ms after the reading"
    assert lat.changed(None, GO, 11.0) is None                                 # first line after start
    assert lat.changed("S|UNKNOWN|DEMO TRAY|NO SENSOR DATA|0", GO, 11.0) is None  # not a moisture change
    assert lat.changed(sb.NO_SERVER_LINE, MATS, 11.0) is None                   # server came back
    assert lat.changed(MATS, STOP, 11.0) is None                                # a replay, not the beacon


def test_latency_times_a_touch_once_and_only_while_fresh():
    lat = sb.Latency()
    lat.event_at = 20.0
    assert lat.changed(STOP, ACKD, 20.45) == "450 ms after the touch"
    assert lat.changed(ACKD, STOP, 21.0) is None                                # used up
    lat.event_at = 30.0
    assert lat.changed(STOP, ACKD, 30.0 + sb.Latency.EVENT_WINDOW + 1) is None  # too late to be the touch


def test_latency_summary():
    lat = sb.Latency()
    assert lat.summary() == "nothing timed"
    for seconds in (0.1, 0.3, 0.2):
        lat.accepted(seconds)
    lat.reading_at = 0.0
    lat.changed(GO, MATS, 1.5)
    assert lat.summary() == ("reading accepted by API n=3 median 200 ms max 300 ms; "
                             "reading -> LCD n=1 median 1500 ms max 1500 ms")


@pytest.mark.skipif(sys.platform == "win32", reason="needs a POSIX pty")
def test_link_survives_the_beacon_disappearing_and_reconnects():
    master, slave = os.openpty()
    tty.setraw(slave)
    link = sb.SerialLink(os.ttyname(slave), reset_wait=0)
    assert link.write_line("S|GO|DEMO TRAY|GO FOR REVIEW|0")
    os.close(master)  # cable pulled
    assert link.write_line("S|GO|DEMO TRAY|GO FOR REVIEW|0") is False
    assert not link.connected and link.read_lines() == []

    master2, slave2 = os.openpty()  # plugged back in (here, as a different device)
    tty.setraw(slave2)
    link.requested, link.next_retry = os.ttyname(slave2), 0
    assert link.read_lines() == [] and link.connected and link.port == os.ttyname(slave2)
    os.write(master2, b'{"type":"hello","fw":"x"}\r\n')
    deadline, lines = time.monotonic() + 2, []
    while not lines and time.monotonic() < deadline:
        lines = link.read_lines()
    assert lines == ['{"type":"hello","fw":"x"}']
    link.close()
    for fd in (slave, master2, slave2):
        os.close(fd)


# --- lightning countdown checker (hardware/check_countdown_v1.py) -------------

import check_countdown_v1 as cc


def stop(line2, alarm):
    return {"code": "STOP", "lcd_line2": line2, "alarm": alarm}


def test_countdown_checker_passes_a_clean_countdown_with_ack_and_restart():
    samples = [(0, stop("STOP - CLR 29:59", True)), (1, stop("STOP - CLR 29:58", True)),
               (2, stop("ACKD - CLR 29:57", False)), (3, stop("STOP - CLR 30:00", True))]
    problems, notes = cc.check(samples)
    assert problems == []
    assert any("acknowledged" in n for n in notes) and any("restart" in n and "re-armed" in n for n in notes)


def test_countdown_checker_flags_bad_lines_codes_drift_and_silent_restarts():
    problems, _ = cc.check([(0, stop("ALL CLEAR IN 29:59 MIN", True))])
    assert any("doesn't fit" in p for p in problems)
    problems, _ = cc.check([(0, {"code": "GO", "lcd_line2": "CLR 29:59", "alarm": False})])
    assert any("must be STOP" in p for p in problems)
    problems, _ = cc.check([(0, stop("CLR 29:59", True)), (1, stop("CLR 29:40", True))])
    assert any("moved" in p for p in problems)
    problems, _ = cc.check([(0, stop("CLR 10:00", False)), (1, stop("CLR 30:00", False))])
    assert any("did not sound again" in p for p in problems)
