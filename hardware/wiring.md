# Beacon wiring

Owner: Anson. Source of truth for pins: the constants at the top of
`firmware/groundwork_beacon/groundwork_beacon.ino` (they match README §5.4).

## Connection plan (pick the first that works)

1. **Grove Base Shield** on the Uno: modules plug into labeled ports.
2. **Grove-to-jumper adapter cables** into the breadboard.
3. **Cut Grove cables**: strip ~5 mm, twist, push into the breadboard, tape for strain relief.

Grove colors: yellow = signal (SCL on I2C) · white = second signal (SDA on I2C) · red = VCC · black = GND.

## Pin map

| Module | Type | Uno pin | Base Shield port | Firmware |
|---|---|---|---|---|
| Moisture sensor | analog in | A0 | A0 | `PIN_MOISTURE`, `HAS_MOISTURE` |
| Light sensor | analog in | A2 | A2 | `PIN_LIGHT`, `HAS_LIGHT` |
| Touch sensor | digital in | D2 | D2 | `PIN_TOUCH` |
| Button | digital in | D4 | D4 | `PIN_BUTTON` |
| Buzzer | digital out | D6 | D6 | `PIN_BUZZER` |
| Red LED + 220 Ω to GND | digital out | D8 | D8 port, yellow | `PIN_RED` |
| Green LED + 220 Ω to GND | digital out | D9 | D8 port, white | `PIN_GREEN` |
| Grove LCD RGB Backlight | I2C | A4 SDA / A5 SCL | any I2C | `HAS_LCD` |
| Barometer (BMP280/BME280/BMP180) | I2C | A4 / A5 (shared) | any I2C | `BARO_CHIP` |
| Power | | 5V, GND → breadboard rails | built in | |

Each shield port also carries the next pin (A0 port = A0 + A1), so the map skips every
other port. A4/A5 are I2C and cannot be analog inputs at the same time.

## Breadboard

- Uno 5V → + rail, GND → − rail. Power Grove modules from 5V (the LCD expects 5V).
- LED: Uno pin → 220 Ω (red-red-brown) → long leg; short leg → GND rail.
- I2C: A4 and A5 to two rows; both I2C modules' white (SDA) and yellow (SCL) join them.
- About 11 Uno-to-breadboard jumpers: 5V, GND, A0, A2, A4, A5, D2, D4, D6, D8, D9.
- Electronics in a box or raised off the table; only the probe prongs go in the soil.
- Label every wire with tape; reseat Grove leads after moving the box.

## Build photos

Add photos here once the beacon is assembled (front, wiring close-up, I2C bus).
