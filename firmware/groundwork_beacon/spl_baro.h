// Infineon DPS310 / Goertek SPL06-001 / SPL07-003 barometer over I2C (0x77, or 0x76 with SDO low).
// No library: the three chips share one register map; the SPL07 (product id 0x11) adds the c31
// and c40 terms. Runs in continuous background mode (1 measurement/s, 8x oversampling), so a read
// never blocks the beacon loop. Verified on hardware with an SPL07-003 (id 0x11): steady to
// +/-0.01 hPa, 22.4 C indoors. The DPS310/SPL06 path (id 0x10) follows the datasheets, untested.
#pragma once
#include <Arduino.h>
#include <Wire.h>

class SplBaro {
 public:
  bool init(uint8_t addr = 0x77) {
    addr_ = addr;
    prod_ = read8(0x0D);
    if (prod_ != 0x10 && prod_ != 0x11) return false;
    write8(0x0C, 0x09);  // soft reset
    delay(40);
    unsigned long start = millis();
    while ((read8(0x08) & 0xC0) != 0xC0) {  // COEF_RDY and SENSOR_RDY
      if (millis() - start > 500) return false;
      delay(5);
    }
    uint8_t b[21] = {0};
    if (!readBlock(0x10, b, prod_ == 0x11 ? 21 : 18)) return false;
    c0_ = sext(((int32_t)b[0] << 4) | (b[1] >> 4), 12);
    c1_ = sext(((int32_t)(b[1] & 0x0F) << 8) | b[2], 12);
    c00_ = sext(((int32_t)b[3] << 12) | ((int32_t)b[4] << 4) | (b[5] >> 4), 20);
    c10_ = sext(((int32_t)(b[5] & 0x0F) << 16) | ((int32_t)b[6] << 8) | b[7], 20);
    c01_ = sext(((int32_t)b[8] << 8) | b[9], 16);
    c11_ = sext(((int32_t)b[10] << 8) | b[11], 16);
    c20_ = sext(((int32_t)b[12] << 8) | b[13], 16);
    c21_ = sext(((int32_t)b[14] << 8) | b[15], 16);
    c30_ = sext(((int32_t)b[16] << 8) | b[17], 16);
    if (prod_ == 0x11) {
      c31_ = sext(((int32_t)b[18] << 4) | (b[19] >> 4), 12);
      c40_ = sext(((int32_t)(b[19] & 0x0F) << 8) | b[20], 12);
    }
    // Temperature source: the SPL07 uses its MEMS sensor; a DPS310 says which one its
    // coefficients were calibrated against in COEF_SRCE bit 7.
    uint8_t tmpExt = prod_ == 0x11 ? 0x80 : (read8(0x28) & 0x80);
    write8(0x06, 0x03);           // pressure: 1/s, 8x oversampling
    write8(0x07, tmpExt | 0x03);  // temperature: 1/s, 8x oversampling
    write8(0x09, 0x00);           // no result bit-shift below 16x oversampling
    write8(0x08, 0x07);           // continuous pressure + temperature
    return true;
  }

  // Latest background result. False until the first measurement lands (about 1 s after init).
  bool read(float &pressureHpa, float &tempC) {
    uint8_t b[6];
    if (!readBlock(0x00, b, 6)) return false;
    int32_t praw = sext(((int32_t)b[0] << 16) | ((int32_t)b[1] << 8) | b[2], 24);
    int32_t traw = sext(((int32_t)b[3] << 16) | ((int32_t)b[4] << 8) | b[5], 24);
    if (praw == 0 && traw == 0) return false;
    const float k = 7864320.0;  // scale factor for 8x oversampling
    float p = praw / k, t = traw / k;
    tempC = c0_ * 0.5 + c1_ * t;
    float pa = c00_ + p * (c10_ + p * (c20_ + p * (c30_ + p * c40_)))
               + t * (c01_ + p * (c11_ + p * (c21_ + p * c31_)));
    pressureHpa = pa / 100.0;
    return true;
  }

  uint8_t productId() const { return prod_; }

 private:
  uint8_t addr_ = 0x77, prod_ = 0;
  int32_t c0_ = 0, c1_ = 0, c00_ = 0, c10_ = 0, c01_ = 0, c11_ = 0, c20_ = 0, c21_ = 0, c30_ = 0;
  int32_t c31_ = 0, c40_ = 0;  // SPL07 only; zero keeps the DPS310/SPL06 formula

  static int32_t sext(int32_t v, uint8_t bits) {
    return (v & (1L << (bits - 1))) ? v - (1L << bits) : v;
  }
  uint8_t read8(uint8_t reg) {
    uint8_t v = 0;
    readBlock(reg, &v, 1);
    return v;
  }
  bool readBlock(uint8_t reg, uint8_t *out, uint8_t n) {
    Wire.beginTransmission(addr_);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom(addr_, n) != n) return false;
    for (uint8_t i = 0; i < n; i++) out[i] = Wire.read();
    return true;
  }
  void write8(uint8_t reg, uint8_t v) {
    Wire.beginTransmission(addr_);
    Wire.write(reg);
    Wire.write(v);
    Wire.endTransmission();
  }
};
