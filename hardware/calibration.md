# Beacon: flash, calibrate, run, fall back

Owner: Anson. Wiring and pin map: [wiring.md](wiring.md). Protocol and rules: README §5.

The beacon proves **sensor → server → beacon**. It never decides safety status:
it shows what the backend's display endpoint says. `moisture_index` and
`light_index` are relative 0–100 scales between your two calibration points,
not volumetric water content or lux, and never evidence about a remote site.

## 1. Laptop setup (once)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt          # includes pyserial + httpx for the bridge
python hardware/serial_bridge.py --list-ports     # Uno shows as /dev/cu.usbmodem* (macOS)
```

Arduino IDE → Library Manager: install **Grove - LCD RGB Backlight**. The kit's barometer is an
**SPL07-003** (DPS310 family, product id `0x11` at `0x77`); its driver is built in
(`spl_baro.h`), so it needs no library. Only for a BMP280 / BME280 / BMP180 module install
**Grove - Barometer Sensor BMP280**, **…BME280**, or **Grove Barometer Sensor** (BMP180).

## 2. Flash

1. `firmware/i2c_scan/i2c_scan.ino` → Serial Monitor 115200. Expect `0x3E` (LCD text),
   `0x62` or `0x30` (LCD backlight), `0x76`/`0x77` (barometer). `0x03` and `0x70` also show up
   with the v4/v5 LCD: they are its backlight chip's reset and all-call addresses, harmless.
2. `firmware/groundwork_beacon/groundwork_beacon.ino`. Set the switches at the top to what is wired:

   | Switch | Default | Set when |
   |---|---|---|
   | `HAS_MOISTURE` | 1 | Tier 1, always |
   | `HAS_LCD` | 1 | set 0 if the LCD library is not installed yet |
   | `HAS_LIGHT` | 1 | set 0 if no light sensor on A2 |
   | `BARO_CHIP` | `BARO_SPL` | the kit's SPL07 (also DPS310/SPL06); `BARO_BMP280`, `BARO_BME280`, `BARO_BMP180`, or `BARO_NONE` |

   A module switched off is **omitted** from readings, never sent as 0.
   Every combination compiles for the Uno (32–51% flash, ≤42% RAM).
3. Serial Monitor at 115200 should show a `hello` line, then one `reading` line per second.
   **Close the Serial Monitor** before running the bridge: only one program can hold the port.

Command line alternative:

```bash
arduino-cli compile --fqbn arduino:avr:uno firmware/groundwork_beacon
arduino-cli upload -p /dev/cu.usbmodem1101 --fqbn arduino:avr:uno firmware/groundwork_beacon
```

## 3. Check the beacon with no backend

```bash
python hardware/serial_bridge.py --port auto --monitor        # validated lines; BAD lines are flagged
python hardware/serial_bridge.py --port auto --demo-states    # cycles every display state
```

`--demo-states` sends each state in `fixtures/display_states.json` for 5 s:
GO (green), MATS / REVIEW (amber, both LEDs), NOGO (red), STOP (red, red LED blinks,
buzzer pulses until you touch), STOP acknowledged, UNKNOWN (white, alternating LEDs).
Touch during STOP: the buzzer stops and an `ack_touch` line appears.
Unplug USB: within 6 s the LCD says `NO LINK` and nothing is green.

## 4. Calibrate (two points per sensor)

Insert the probe to the same depth every time: prongs in the soil, electronics above it.

```bash
python hardware/serial_bridge.py --port auto --calibrate moisture-dry    # probe in the dry tray
python hardware/serial_bridge.py --port auto --calibrate moisture-wet    # probe in soaked soil
python hardware/serial_bridge.py --port auto --calibrate light-dark      # cover the sensor
python hardware/serial_bridge.py --port auto --calibrate light-bright    # room or phone light
python hardware/serial_bridge.py --calibrate show
```

Each point is the median of 10 readings, saved to `hardware/calibration.json` (commit it,
so teammates' replays use the same points). Direction does not matter: the resistive Grove
probe reads higher when wet, capacitive probes lower. You get a warning if readings are
noisy or the two points are within 10% of the range. Until moisture is calibrated the
bridge sends `raw_adc` only, with `calibration: "uncalibrated"`, and no index.
Recalibrate if you change soil, probe or port. Barometer: factory calibrated; just
check the values are plausible and steady. Touch/button: debounced 30 ms in firmware;
long press is 2 s.

## 5. Run

```bash
uvicorn backend.app.main:app --reload --port 8000                        # terminal 1
python hardware/serial_bridge.py --port auto --api http://localhost:8000 # terminal 2
```

Every second the bridge validates the Uno's line, stamps `recorded_at` (the Uno has no
clock), adds calibrated indexes, and POSTs `/api/v1/sensors/readings` with
`Authorization: Bearer $GROUNDWORK_SENSOR_TOKEN` (default `dev-sensor-token`, same as the backend). Touch and long-press lines go to
`/api/v1/devices/tray-01/events`. It also reads `/api/v1/devices/tray-01/display` every
second and writes `S|CODE|line1|line2|alarm` to the Uno on change, plus every 2 s as a
heartbeat. Server reachable but no status for the device: the LCD shows `NO STATUS` with
the HTTP code. Server unreachable: `NO SERVER`, and readings and events queue (events are
never dropped; the newest reading goes first when the link returns). Bad serial lines are
logged and skipped; `seq` gaps and board resets are logged. Every live reading is also
written to `hardware/recordings/tray-01-<time>.csv`.

The backend decides what the beacon shows (`backend/app/services/policies.py`): heavy truck
GO below moisture index 40, MATS below 65, else NO GO; pickup 60 / 80. No reading for 15 s →
`NO SENSOR DATA` (UNKNOWN). **A storm replay forces STOP_WORK and re-arms the alarm**, so warn
whoever is at the tray before anyone starts one.

Verified end to end against `main` with the fake beacon (below): GO → pour → MATS → NO GO →
replay STOP (buzzer) → touch → `STOP WORK - ACKD`, still STOP → replay stop → NO GO.

Verified on the real beacon (Oct 17): every module (LCD text and colors, both LEDs, buzzer, touch,
button, moisture, light, SPL07 pressure 1010.6 hPa / 22.4 °C); probe out of / into water → GO / NO
GO in 110–710 ms; replay STOP alarm → touch → `ACKD` in 15 ms with `acknowledged_at` on the
server; long press → `SUPV REVIEW`; bridge stopped → `NO LINK`, never green; USB pulled and
replugged → `beacon reconnected` in 8 s with no restart. 154 readings, 0 rejected, 0 bad lines.

**Cable pulled or board reset mid-demo:** the bridge logs `beacon disconnected`, keeps running
(anything already queued still goes to the API) and retries the port every 2 s; plug it back into the same
USB socket (or run with `--port auto`) and it logs `beacon reconnected` and resends the status.
The beacon shows `NO LINK` while the bridge is gone, never green.

**Latency (README section 15 metric):** each LCD change the beacon caused is logged with its
time, e.g. `beacon <- S|MATS|… (454 ms after the reading)` or `(13 ms after the touch)`, and
Ctrl+C prints a summary: `latency: reading accepted by API … ; reading -> LCD … ; touch -> LCD …`.
Changes the beacon didn't cause (a replay started from the dashboard) aren't timed. Against a
local API with the fake beacon: reading → LCD about 0.5 s, touch → LCD about 15 ms. Add up to
1 s for the firmware's sampling period, which the bridge can't see.

## 6. Recorded fallback (USB or Arduino fails on stage)

`fixtures/sensor_replay.csv` is the team's **simulated** fallback (rows labeled
`calibration: simulated_replay_v1`). Two ways to play it:

```bash
python hardware/serial_bridge.py --replay fixtures/sensor_replay.csv --loop              # dashboard only
python hardware/serial_bridge.py --replay fixtures/sensor_replay.csv --loop --port auto  # probe dead, beacon fine
```

Everything replays as `mode: sensor_replay` with the row's own calibration label, so simulated
rows stay labeled simulated. Keep `--loop` on: the backend ignores readings older than 15 s.
With `--port`, the beacon keeps showing server status and touch still acknowledges, while the
board's own readings are ignored. (`replay_sensor_v2.py` does the dashboard-only version too, but
must never run with the beacon plugged in.)

Once the tray works, a real rehearsal recording can replace the fallback. Recordings use the
API's field names (a superset of the fixture's columns), so both replayers read them:

```bash
cp hardware/recordings/tray-01-<best-run>.csv fixtures/sensor_replay.csv
```

Real rows then carry `calibration: dry_wet_2point_v1`; say "recorded" instead of "simulated".

## 7. No Arduino at all (development)

```bash
python hardware/fake_beacon.py                       # prints a port; p = pour, t = touch, f = flag
python hardware/serial_bridge.py --port /dev/ttys003 # the port it printed
```

The fake beacon emulates the firmware on a pseudo-terminal (macOS/Linux) and prints what the
LCD, LEDs and buzzer would do. Its lines are flagged, so the bridge posts them as
`sensor_replay` with `calibration: simulated_replay_v1`, never as the live tray. It doesn't need
`calibration.json`. Clean up afterwards like any simulated replay (see HANDOFF_v4).

## 8. Demo checklist

- [ ] USB-B cable (and adapter), beacon in its box, wires labeled, LCD facing judges
- [ ] Fresh `moisture-dry` / `moisture-wet` calibration with the stage soil
- [ ] Bridge prints `ok` for readings; beacon shows green `GO` on the dry tray
- [ ] Pour → amber within ~2 s; copy the bridge's `latency:` line at Ctrl+C (latency metric)
- [ ] Storm replay → red, buzzer; touch → silent, still STOP
- [ ] Unplug USB → `NO LINK` within 6 s, never green; replug recovers
- [ ] Real recording copied to `fixtures/sensor_replay.csv`; `--replay` tested with the Uno unplugged
- [ ] Rinse and dry the probe between rehearsals (resistive probes corrode)

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cannot open … Close the Arduino IDE Serial Monitor` | close the Serial Monitor (or any other bridge) |
| `no Arduino serial port found` | cable is charge-only, or pass `--port`; check `--list-ports` |
| One `rejected serial line: not JSON` at start | boot noise after the port reset; harmless |
| Readings stop, `beacon reset detected` | loose USB or power dip; reseat the cable |
| LCD blank but LEDs work | I2C wiring (A4 SDA, A5 SCL), 5V to the LCD; run `i2c_scan` |
| `HTTP 401` | `GROUNDWORK_SENSOR_TOKEN` differs between bridge and backend |
| `HTTP 422` | payload rejected by the API contract; run `pytest hardware/tests` (contract test) |
| Moisture never moves | wrong port (must be A0); `--monitor` while touching the prongs to water |
| Index jumpy | dry/wet span too small, probe moving, or loose Grove lead |
| Upload fails `stk500 … protocol error`, or `multiple access on port` | another program holds the port (Serial Monitor, a bridge, or any app that auto-opens serial devices): `lsof /dev/cu.usbmodem*` shows who |
| An LED stays dark in every state | swap in a spare LED (one of the kit's was dead); check its resistor's two legs share columns with the pin jumper and the LED's long leg; short leg in the strip by the **blue** line |
| An LED or button stops after moving the cable | a jumper worked loose at the Uno header; push it back in and tape the header row and the USB cable down |
