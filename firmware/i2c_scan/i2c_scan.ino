// I2C scanner for the Groundwork beacon. Open Serial Monitor at 115200 baud.
// Expected on the Uno's I2C bus (A4 SDA / A5 SCL):
//   0x3E  Grove LCD text controller
//   0x62  Grove LCD RGB backlight (v4)   or 0x30 (v5 backlight)
//   0x76 / 0x77  barometer (BMP280 / BME280 / BMP180)

#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin();
}

void loop() {
  uint8_t found = 0;
  Serial.println(F("Scanning I2C..."));
  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("  found 0x"));
      if (address < 16) Serial.print('0');
      Serial.print(address, HEX);
      if (address == 0x3E) Serial.print(F("  LCD text"));
      else if (address == 0x62 || address == 0x30) Serial.print(F("  LCD backlight"));
      else if (address == 0x76 || address == 0x77) Serial.print(F("  barometer"));
      Serial.println();
      found++;
    }
  }
  if (found == 0) Serial.println(F("  nothing found: check 5V/GND, SDA->A4, SCL->A5"));
  delay(3000);
}
