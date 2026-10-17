// Groundwork site beacon (Arduino Uno). Owner: Anson.
//
// Senses soil moisture, light and pressure/temperature, SHOWS the server's
// decision on the LCD, LEDs and buzzer, and reports crew input (touch = ack,
// long button press = crew flag). It never computes safety status.
//
// Serial protocol (README section 5.7), 115200 baud, one line per message:
//   Uno -> laptop  {"type":"reading","seq":412,"uptime_ms":412003,"moisture_raw":678,...}
//                  {"type":"event","seq":413,"event":"ack_touch"}
//   laptop -> Uno  S|STOP|DEMO TRAY|STOP WORK - ACK?|1   (code|lcd line 1|lcd line 2|alarm)
// No status line for 6 s -> NO LINK (white backlight, alternating LEDs, never green).

#include <Wire.h>

// ---- Module switches. 0 = not wired: the field is omitted, never sent as 0. ----
#ifndef HAS_MOISTURE
#define HAS_MOISTURE 1  // Tier 1
#endif
#ifndef HAS_LIGHT
#define HAS_LIGHT 1  // Tier 3: light sensor on A2 (set 0 if not wired)
#endif
#ifndef HAS_LCD
#define HAS_LCD 1  // Tier 2: needs Seeed's "Grove - LCD RGB Backlight" library
#endif
#define BARO_NONE 0
#define BARO_BMP280 1  // library "Grove - Barometer Sensor BMP280"
#define BARO_BME280 2  // library "Grove - Barometer Sensor BME280"
#define BARO_BMP180 3  // library "Grove Barometer Sensor" (BMP085/BMP180)
#define BARO_SPL 4     // DPS310 / SPL06 / SPL07 (product id 0x10/0x11 at 0x77); built in, no library
#ifndef BARO_CHIP
#define BARO_CHIP BARO_SPL  // Tier 3: match the chip on the module (firmware/i2c_scan finds it)
#endif

#if HAS_LCD
#include "rgb_lcd.h"
rgb_lcd lcd;
#endif
#if BARO_CHIP == BARO_BMP280
#include "Seeed_BMP280.h"
BMP280 baro;
#elif BARO_CHIP == BARO_BME280
#include "Seeed_BME280.h"
BME280 baro;
#elif BARO_CHIP == BARO_BMP180
#include "BMP085.h"
BMP085 baro;
#elif BARO_CHIP == BARO_SPL
#include "spl_baro.h"
SplBaro baro;
#endif

// ---- Pin map (README section 5.4) ----
const uint8_t PIN_MOISTURE = A0;
const uint8_t PIN_LIGHT = A2;
const uint8_t PIN_TOUCH = 2;
const uint8_t PIN_BUTTON = 4;
const uint8_t PIN_BUZZER = 6;
const uint8_t PIN_RED = 8;
const uint8_t PIN_GREEN = 9;

const unsigned long READING_INTERVAL_MS = 1000;
const unsigned long STALE_AFTER_MS = 6000;
const unsigned long DEBOUNCE_MS = 30;
const unsigned long LONG_PRESS_MS = 2000;
const unsigned long PAGE_TIMEOUT_MS = 10000;
const uint8_t ANALOG_SAMPLES = 8;
// Buzzer loudness as PWM duty on D6 (a PWM pin): 255 = full, lower = quieter. Each alarm beep lasts
// BEEP_MS of every second; shorter also sounds softer. Original firmware: 255 and 300.
#ifndef BUZZER_VOLUME
#define BUZZER_VOLUME 4
#endif
#ifndef BEEP_MS
#define BEEP_MS 100
#endif

enum Code : uint8_t { CODE_UNKNOWN, CODE_GO, CODE_MATS, CODE_REVIEW, CODE_NOGO, CODE_STOP };

struct Status {
  Code code;
  char line1[17];
  char line2[17];
  bool alarm;
};

Status status = {CODE_UNKNOWN, "NO LINK", "CHECK APP", false};
bool haveStatus = false;
unsigned long lastStatusMs = 0;
bool alarmAcked = false;  // touch silenced the current alarm
unsigned long seq = 0;

// Latest sensor values, for the LCD pages.
int moistureRaw = -1;
int lightRaw = -1;
bool baroOk = false;
float pressureHpa = 0;
float tempC = 0;

struct Debounced {
  uint8_t pin;
  bool stable;
  bool lastRaw;
  unsigned long changedAt;
};
Debounced touch = {PIN_TOUCH, false, false, 0};
Debounced button = {PIN_BUTTON, false, false, 0};
unsigned long buttonDownAt = 0;
bool longPressSent = false;

uint8_t page = 0;  // 0 status, 1 moisture/light, 2 pressure/temperature
unsigned long pageChangedAt = 0;

char rx[96];
uint8_t rxLen = 0;
bool rxOverflow = false;

// ---------------------------------------------------------------------------

bool linkStale(unsigned long now) {
  return !haveStatus || now - lastStatusMs > STALE_AFTER_MS;
}

bool alarmSounding(unsigned long now) {
  return !linkStale(now) && status.code == CODE_STOP && status.alarm && !alarmAcked;
}

int readAnalog(uint8_t pin) {
  long sum = 0;
  for (uint8_t i = 0; i < ANALOG_SAMPLES; i++) sum += analogRead(pin);
  return (int)(sum / ANALOG_SAMPLES);
}

void sendEvent(const __FlashStringHelper *name) {
  Serial.print(F("{\"type\":\"event\",\"seq\":"));
  Serial.print(++seq);
  Serial.print(F(",\"event\":\""));
  Serial.print(name);
  Serial.println(F("\"}"));
}

void readBarometer() {
#if BARO_CHIP == BARO_BMP280 || BARO_CHIP == BARO_BME280
  tempC = baro.getTemperature();
  pressureHpa = baro.getPressure() / 100.0;
#elif BARO_CHIP == BARO_BMP180
  tempC = baro.bmp085GetTemperature(baro.bmp085ReadUT());
  pressureHpa = baro.bmp085GetPressure(baro.bmp085ReadUP()) / 100.0;
#elif BARO_CHIP == BARO_SPL
  if (!baro.read(pressureHpa, tempC)) pressureHpa = 0;  // 0 fails the plausibility check: nothing sent
#endif
}

void sendReading(unsigned long now) {
  Serial.print(F("{\"type\":\"reading\",\"seq\":"));
  Serial.print(++seq);
  Serial.print(F(",\"uptime_ms\":"));
  Serial.print(now);
#if HAS_MOISTURE
  moistureRaw = readAnalog(PIN_MOISTURE);
  Serial.print(F(",\"moisture_raw\":"));
  Serial.print(moistureRaw);
#endif
#if HAS_LIGHT
  lightRaw = readAnalog(PIN_LIGHT);
  Serial.print(F(",\"light_raw\":"));
  Serial.print(lightRaw);
#endif
  if (baroOk) {
    readBarometer();
    // Station pressure; skip implausible values rather than sending junk.
    if (pressureHpa > 300 && pressureHpa < 1100) {
      Serial.print(F(",\"pressure_hpa\":"));
      Serial.print(pressureHpa, 2);
      Serial.print(F(",\"temp_c\":"));
      Serial.print(tempC, 1);
    }
  }
  Serial.println('}');
}

// ---- Status lines from the bridge --------------------------------------------

bool parseCode(const char *s, Code *out) {
  if (!strcmp(s, "GO")) *out = CODE_GO;
  else if (!strcmp(s, "MATS")) *out = CODE_MATS;
  else if (!strcmp(s, "REVIEW")) *out = CODE_REVIEW;
  else if (!strcmp(s, "NOGO")) *out = CODE_NOGO;
  else if (!strcmp(s, "STOP")) *out = CODE_STOP;
  else if (!strcmp(s, "UNKNOWN")) *out = CODE_UNKNOWN;
  else return false;
  return true;
}

void copyLcdText(char *dest, const char *src) {
  uint8_t i = 0;
  for (; i < 16 && src[i]; i++) dest[i] = (src[i] >= 0x20 && src[i] <= 0x7E) ? src[i] : '?';
  dest[i] = '\0';
}

// "S|CODE|line1|line2|alarm". Anything else is ignored.
void handleLine(char *line, unsigned long now) {
  char *fields[5];
  uint8_t n = 0;
  fields[n++] = line;
  for (char *p = line; *p && n < 5; p++) {
    if (*p == '|') {
      *p = '\0';
      fields[n++] = p + 1;
    }
  }
  if (n != 5 || strcmp(fields[0], "S") != 0) return;
  Code code;
  if (!parseCode(fields[1], &code)) return;
  bool alarm;
  if (!strcmp(fields[4], "1")) alarm = true;
  else if (!strcmp(fields[4], "0")) alarm = false;
  else return;

  bool wasAlarm = haveStatus && status.code == CODE_STOP && status.alarm;
  if (code == CODE_STOP && alarm && !wasAlarm) alarmAcked = false;  // a new STOP_WORK re-arms
  if (code != status.code) page = 0;  // jump back to the status page on any change

  status.code = code;
  copyLcdText(status.line1, fields[2]);
  copyLcdText(status.line2, fields[3]);
  status.alarm = alarm;
  haveStatus = true;
  lastStatusMs = now;
}

void pollSerial(unsigned long now) {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!rxOverflow) {
        rx[rxLen] = '\0';
        handleLine(rx, now);
      }
      rxLen = 0;
      rxOverflow = false;
    } else if (rxLen < sizeof(rx) - 1) {
      rx[rxLen++] = c;
    } else {
      rxOverflow = true;  // drop the whole over-long line
    }
  }
}

// ---- Inputs -------------------------------------------------------------------

bool updateDebounced(Debounced &d, unsigned long now) {
  bool raw = digitalRead(d.pin) == HIGH;
  if (raw != d.lastRaw) {
    d.lastRaw = raw;
    d.changedAt = now;
  }
  if (raw != d.stable && now - d.changedAt >= DEBOUNCE_MS) {
    d.stable = raw;
    return true;
  }
  return false;
}

void pollInputs(unsigned long now) {
  // Touch acknowledges; it does not clear. STOP_WORK stays until the server ends it.
  if (updateDebounced(touch, now) && touch.stable && alarmSounding(now)) {
    alarmAcked = true;
    sendEvent(F("ack_touch"));
  }

  if (updateDebounced(button, now)) {
    if (button.stable) {
      buttonDownAt = now;
      longPressSent = false;
    } else if (!longPressSent) {
      page = (page + 1) % 3;  // short press: next LCD page
      pageChangedAt = now;
    }
  }
  if (button.stable && !longPressSent && now - buttonDownAt >= LONG_PRESS_MS) {
    longPressSent = true;
    sendEvent(F("crew_flag"));  // supervisor review only; never touches weather_state
  }
  if (page != 0 && now - pageChangedAt > PAGE_TIMEOUT_MS) page = 0;
}

// ---- Outputs (README section 5.6) ----------------------------------------------

#if HAS_LCD
uint8_t shownRgb[3] = {1, 1, 1};
char shownLine1[17] = "?";
char shownLine2[17] = "?";

void lcdShow(const char *l1, const char *l2, uint8_t r, uint8_t g, uint8_t b) {
  if (r != shownRgb[0] || g != shownRgb[1] || b != shownRgb[2]) {
    lcd.setRGB(r, g, b);
    shownRgb[0] = r;
    shownRgb[1] = g;
    shownRgb[2] = b;
  }
  if (strcmp(l1, shownLine1) || strcmp(l2, shownLine2)) {
    char padded[17];
    snprintf(padded, sizeof(padded), "%-16s", l1);
    lcd.setCursor(0, 0);
    lcd.print(padded);
    snprintf(padded, sizeof(padded), "%-16s", l2);
    lcd.setCursor(0, 1);
    lcd.print(padded);
    strcpy(shownLine1, l1);
    strcpy(shownLine2, l2);
  }
}

void updateLcd(unsigned long now, Code shown, bool stale) {
  uint8_t r = 255, g = 255, b = 255;  // white: UNKNOWN or stale
  if (!stale) {
    switch (shown) {
      case CODE_GO: r = 0; g = 255; b = 0; break;
      case CODE_MATS:
      case CODE_REVIEW: r = 255; g = 110; b = 0; break;  // amber
      case CODE_NOGO:
      case CODE_STOP: r = 255; g = 0; b = 0; break;
      default: break;
    }
  }
  char l1[17], l2[17];
  if (page == 1) {
    if (moistureRaw >= 0) snprintf(l1, sizeof(l1), "MOISTURE %d", moistureRaw);
    else strcpy(l1, "MOISTURE --");
    if (lightRaw >= 0) snprintf(l2, sizeof(l2), "LIGHT %d", lightRaw);
    else strcpy(l2, "LIGHT --");
  } else if (page == 2) {
    if (baroOk) {
      char num[10];
      dtostrf(pressureHpa, 0, 1, num);
      snprintf(l1, sizeof(l1), "%s hPa", num);
      dtostrf(tempC, 0, 1, num);
      snprintf(l2, sizeof(l2), "%s C", num);
    } else {
      strcpy(l1, "NO BAROMETER");
      strcpy(l2, "");
    }
  } else if (stale) {
    strcpy(l1, "NO LINK");
    strcpy(l2, "CHECK APP");
  } else {
    strcpy(l1, status.line1);
    strcpy(l2, status.line2);
  }
  lcdShow(l1, l2, r, g, b);
}
#endif

void updateOutputs(unsigned long now) {
  bool stale = linkStale(now);
  Code shown = stale ? CODE_UNKNOWN : status.code;
  bool blink = (now / 400) % 2;
  bool red, green;
  switch (shown) {
    case CODE_GO: red = false; green = true; break;
    case CODE_MATS:
    case CODE_REVIEW: red = true; green = true; break;
    case CODE_NOGO: red = true; green = false; break;
    case CODE_STOP: red = blink; green = false; break;
    default: red = blink; green = !blink; break;  // UNKNOWN or stale: alternate
  }
  digitalWrite(PIN_RED, red ? HIGH : LOW);
  digitalWrite(PIN_GREEN, green ? HIGH : LOW);
  analogWrite(PIN_BUZZER, (alarmSounding(now) && now % 1000 < BEEP_MS) ? BUZZER_VOLUME : 0);
#if HAS_LCD
  updateLcd(now, shown, stale);
#endif
}

// ---------------------------------------------------------------------------

void setup() {
  pinMode(PIN_TOUCH, INPUT);
  pinMode(PIN_BUTTON, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  Serial.begin(115200);
  Wire.begin();
#if HAS_LCD
  lcd.begin(16, 2);
#endif
#if BARO_CHIP == BARO_BMP280 || BARO_CHIP == BARO_BME280
  baroOk = baro.init();
#elif BARO_CHIP == BARO_BMP180
  baro.init();
  baroOk = true;
#elif BARO_CHIP == BARO_SPL
  baroOk = baro.init();
#endif
#if BARO_CHIP == BARO_SPL
  const char *baroName = baro.productId() == 0x11 ? "spl07" : "dps310_spl06";
#else
  const char *baroName = BARO_CHIP == BARO_BMP280 ? "bmp280" : BARO_CHIP == BARO_BME280 ? "bme280"
                         : BARO_CHIP == BARO_BMP180 ? "bmp180" : "none";
#endif
  Serial.print(F("{\"type\":\"hello\",\"fw\":\"groundwork_beacon/1.0\",\"moisture\":"));
  Serial.print(HAS_MOISTURE ? F("true") : F("false"));
  Serial.print(F(",\"light\":"));
  Serial.print(HAS_LIGHT ? F("true") : F("false"));
  Serial.print(F(",\"lcd\":"));
  Serial.print(HAS_LCD ? F("true") : F("false"));
  Serial.print(F(",\"baro\":\""));
  Serial.print(baroName);
  Serial.print(BARO_CHIP != BARO_NONE && !baroOk ? F("_failed\"}") : F("\"}"));
  Serial.println();
}

void loop() {
  static unsigned long lastReading = 0;
  unsigned long now = millis();
  pollSerial(now);
  pollInputs(now);
  if (now - lastReading >= READING_INTERVAL_MS) {
    lastReading = now;
    sendReading(now);
  }
  updateOutputs(now);
}
