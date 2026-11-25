/*
 * Project E-Noise - ESP32 sensor node firmware
 * ---------------------------------------------
 * One node per table. Each node:
 *   1. Samples the MAX9814 microphone continuously from loop() (no blocking
 *      sampling window) and once per second publishes the RMS level of the
 *      last second as an estimated dB value.
 *   2. Publishes that reading over MQTT (TLS, broker certificate checked).
 *   3. Drives the 11 LEDs (5 green / 3 yellow / 2 red / 1 critical) exactly
 *      as the backend tells it on the LED topic. The node never decides the
 *      LED state itself: the confirmation engine runs on the server
 *      (server/src/services/telemetryService.js).
 *   4. Publishes a retained {"online":true} status and sets {"online":false}
 *      as its MQTT Last Will, so the dashboard sees power/Wi-Fi loss.
 *   5. When the backend asks (only while the table is already loud), records
 *      ~1 second of audio and sends it as a WAV clip for YAMNet
 *      classification. The clip only lives in RAM and is freed right after.
 *
 * Setup:
 *   - Copy secrets.example.h to secrets.h and fill in Wi-Fi, broker details
 *     and the broker's root CA certificate (MQTT_CA_CERT).
 *   - Board: "ESP32 Dev Module" (ESP32-WROOM-32 / DevKitV1).
 *   - Libraries: PubSubClient (Nick O'Leary) 2.8, ArduinoJson (Benoit Blanchon) 7.x.
 *   - Compile: arduino-cli compile --fqbn esp32:esp32:esp32 firmware/enoise_node
 *
 * Wiring:
 *   MAX9814 OUT -> GPIO34 (ADC1 channel 6, input-only). ADC1 is required:
 *                  ADC2 pins (GPIO 0, 2, 4, 12-15, 25-27) cannot be read
 *                  while Wi-Fi is on.
 *   MAX9814 VCC -> 3V3, GND -> GND, GAIN pin floating (60 dB gain)
 *   AGC: the MAX9814's automatic gain control changes the gain with the
 *   sound level, which makes dB readings unreliable. Firmware CANNOT turn it
 *   off: per the datasheet, wire the chip's TH pin to MICBIAS. Many breakout
 *   boards don't expose TH; then use a microphone without AGC (MAX4466 or
 *   an I2S INMP441). With AGC off, set GAIN to VDD (40 dB) so 80-90 dB
 *   talking doesn't clip. See docs/CALIBRATION.md.
 *   11 LEDs, each through a 220-330 ohm resistor to GND, anodes to:
 *     Green:    GPIO 4, 5, 18, 19, 21
 *     Yellow:   GPIO 22, 23, 32
 *     Red:      GPIO 25, 26
 *     Critical: GPIO 27 (blinks locally while the backend says "critical")
 *
 * Calibration mode (docs/CALIBRATION.md): type "cal" + Enter in the Serial
 * Monitor (115200 baud) to switch it on/off, or build with
 * -DCALIBRATION_MODE=1. It prints the uncorrected level once per second and
 * publishes NO telemetry, so playing test tones creates no events. The node
 * stays connected and online.
 *
 * Connection handling: nothing in loop() waits for Wi-Fi or MQTT. Each
 * reconnect attempt is spaced out with a growing delay (2 s, 4 s, 8 s ...
 * up to 60 s), so the LEDs keep working while the network is down.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <math.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.h is missing: copy secrets.example.h to secrets.h and fill in your Wi-Fi and broker details."
#endif

// Sent in every reading ("fw") and shown on the table page. Bump it for every
// build you flash, and flash the same version to every node.
#define FIRMWARE_VERSION "1.1.0"

#ifndef CALIBRATION_MODE
#define CALIBRATION_MODE 0
#endif

#ifndef MQTT_CA_CERT
#error "MQTT_CA_CERT is missing from secrets.h: paste the broker's root CA certificate (PEM). See secrets.example.h."
#endif

// ---------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------
const unsigned long TELEMETRY_INTERVAL_MS = 1000;   // one reading per second
const unsigned long RETRY_MIN_MS = 2000;            // first reconnect delay
const unsigned long RETRY_MAX_MS = 60000;           // longest reconnect delay
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000; // give WiFi.begin this long before retrying
const unsigned long LED_FAILSAFE_MS = 30000;        // LEDs off if the backend goes quiet

// Audio capture for YAMNet (only when the backend asks for it).
const uint32_t AUDIO_SAMPLE_RATE_HZ = 16000; // YAMNet's input rate
const uint32_t AUDIO_CLIP_SECONDS = 1;
const uint32_t AUDIO_NUM_SAMPLES = AUDIO_SAMPLE_RATE_HZ * AUDIO_CLIP_SECONDS;

// ---------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------
const int MIC_PIN = 34;
// ADC1 = GPIO 32-39 on the classic ESP32. ADC2 shares hardware with Wi-Fi.
static_assert(MIC_PIN >= 32 && MIC_PIN <= 39, "MIC_PIN must be an ADC1 pin (GPIO32-39): ADC2 cannot be read while Wi-Fi is on.");
// GPIO5 is a boot strapping pin; an LED load on it is fine at boot.
const int GREEN_PINS[5] = {4, 5, 18, 19, 21};
const int YELLOW_PINS[3] = {22, 23, 32};
const int RED_PINS[2] = {25, 26};
const int CRITICAL_PIN = 27;

// ---------------------------------------------------------------------
// Sound level: RMS over the whole second, AC part only
// ---------------------------------------------------------------------
// loop() takes one ADC sample every LEVEL_SAMPLE_INTERVAL_US (target 4 kHz;
// the real rate depends on how busy the loop is) and keeps a running sum
// and sum of squares in millivolts. Once per second the mean (the mic's DC
// bias) is subtracted and the RMS of what is left is turned into dB with
// the calibration table below. If the loop was blocked (audio capture,
// TLS handshake) and fewer than LEVEL_MIN_SAMPLES were taken, that second
// is skipped instead of publishing a value made from a few samples.
const uint32_t LEVEL_SAMPLE_INTERVAL_US = 250;   // 4 kHz target (> 2 kHz to limit aliasing)
const uint32_t LEVEL_MIN_SAMPLES = 2000;         // at least 2 kHz average over the second

// High-pass filter against highway rumble: a first-order filter at 150 Hz,
// applied to every sample before the RMS (an A-weighted meter also turns
// low frequencies down; this is a cheap partial version of that). It also
// removes the mic's DC bias. Calibrate AFTER flashing firmware with it.
const float HPF_CUTOFF_HZ = 150.0f;
const float HPF_RC_US = 1000000.0f / (2.0f * PI * HPF_CUTOFF_HZ); // ~1061 us

// ---- Calibration table: PLACEHOLDER VALUES, NOT MEASURED ----------------
// Each row maps the AC RMS microphone voltage (millivolts) to the sound
// level (dB(A)) read on a reference meter at the same moment. Fill these
// from bench tests (docs/HARDWARE_GUIDE.md "Calibration"): play steady
// sounds at several levels, note the mV RMS printed on Serial and the
// meter reading, and replace the rows (keep them sorted by mV, at least
// two rows). Between rows the firmware interpolates linearly in
// 20*log10(mV); outside the table it extrapolates from the nearest
// segment and clamps to DB_FLOOR..DB_CEIL. Until this is done, readings
// are estimates ("dB (est.)" on the dashboard) and thresholds must be
// tuned against them.
struct CalPoint {
  float mv_rms; // PLACEHOLDER
  float db;     // PLACEHOLDER
};
const CalPoint CAL_TABLE[] = {
  {   2.0f, 35.0f }, // PLACEHOLDER: quiet room
  {  10.0f, 50.0f }, // PLACEHOLDER: normal conversation at the table
  {  50.0f, 65.0f }, // PLACEHOLDER: loud conversation
  { 250.0f, 80.0f }  // PLACEHOLDER: shouting / loud music
};
const int CAL_POINTS = sizeof(CAL_TABLE) / sizeof(CAL_TABLE[0]);
static_assert(sizeof(CAL_TABLE) / sizeof(CAL_TABLE[0]) >= 2, "CAL_TABLE needs at least two points.");
const float DB_FLOOR = 30.0f;
const float DB_CEIL = 100.0f;
const bool PRINT_RMS_MV = false; // true: also print "[level] ..." every second in normal mode

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
WiFiClientSecure tlsClient;
PubSubClient mqtt(tlsClient);

// Topic names, built once in setup() (fixed buffers, no heap use later).
char telemetryTopic[64], statusTopic[64], ledTopic[64], audioRequestTopic[64], audioTopic[64];

unsigned long wifiNextAttemptAt = 0;
unsigned long wifiRetryDelay = RETRY_MIN_MS;
unsigned long mqttNextAttemptAt = 0;
unsigned long mqttRetryDelay = RETRY_MIN_MS;

bool ledCritical = false;
bool blinkOn = false;
unsigned long lastBlinkToggle = 0;
unsigned long lastTelemetryAt = 0;
unsigned long lastLedCommandAt = 0;
bool ledFailsafeActive = false;
bool audioCaptureRequested = false;
bool calibrationMode = CALIBRATION_MODE;

// High-pass filter state (previous input and output, in mV).
float hpPrevIn = 0, hpPrevOut = 0;
bool hpSeeded = false;

// Running level accumulators for the current one-second window.
uint32_t levelSampleCount = 0;
double levelSum = 0;    // sum of mV
double levelSumSq = 0;  // sum of mV^2
unsigned long lastLevelSampleUs = 0;
float lastRmsMv = 0; // for the calibration-mode line

void setup() {
  Serial.begin(115200);

  snprintf(telemetryTopic, sizeof(telemetryTopic), "enoise/%s/telemetry", NODE_ID);
  snprintf(statusTopic, sizeof(statusTopic), "enoise/%s/status", NODE_ID);
  snprintf(ledTopic, sizeof(ledTopic), "enoise/%s/led", NODE_ID);
  snprintf(audioRequestTopic, sizeof(audioRequestTopic), "enoise/%s/audio-request", NODE_ID);
  snprintf(audioTopic, sizeof(audioTopic), "enoise/%s/audio", NODE_ID);

  Serial.printf("[boot] E-Noise node %s, firmware %s%s\n", NODE_ID, FIRMWARE_VERSION, calibrationMode ? " (calibration mode)" : "");
  setupLedPins();
  analogReadResolution(12);
  analogSetPinAttenuation(MIC_PIN, ADC_11db); // full 0-3.3 V range (the mic output is biased at ~1.25 V)
  lastLedCommandAt = millis();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  // Check the broker's certificate against its root CA (secrets.h). The
  // ESP32 needs the clock for this; SNTP is started once Wi-Fi is up.
  tlsClient.setCACert(MQTT_CA_CERT);
  tlsClient.setTimeout(10); // seconds; a stuck TLS handshake can't block for long
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);

  resetLevelWindow();
}

void loop() {
  sampleLevel(); // cheap; runs on every pass
  handleSerialCommands();

  maintainWifi();
  maintainMqtt();
  if (mqtt.connected()) mqtt.loop();

  // The ~1 s capture runs here, never inside the MQTT callback.
  if (audioCaptureRequested) {
    audioCaptureRequested = false;
    captureAndPublishAudio();
    restartLevelAfterBlocking(); // the capture blocked the loop: start a fresh second
  }

  updateCriticalBlink();
  updateLedFailsafe();

  unsigned long now = millis();
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    float db;
    if (finishLevelWindow(&db)) {
      if (calibrationMode) printCalibrationLine(db);
      else publishTelemetry(db);
    }
    // else: too few samples this second (loop was blocked) -> no reading published
  }
}

// ---------------------------------------------------------------------
// Wi-Fi and MQTT (never block the loop)
// ---------------------------------------------------------------------
unsigned long nextDelay(unsigned long current) {
  unsigned long next = current * 2;
  return next > RETRY_MAX_MS ? RETRY_MAX_MS : next;
}

void maintainWifi() {
  static bool clockRequested = false;
  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryDelay = RETRY_MIN_MS;
    if (!clockRequested) {
      // Certificate checking needs a roughly correct clock (NTP, non-blocking).
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      clockRequested = true;
    }
    return;
  }
  clockRequested = false;
  unsigned long now = millis();
  if ((long)(now - wifiNextAttemptAt) < 0) return; // still waiting before the next try

  Serial.printf("[wifi] Connecting to %s (next retry in %lu s)...\n", WIFI_SSID, (WIFI_CONNECT_TIMEOUT_MS + wifiRetryDelay) / 1000);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // Give this attempt time to finish, then back off further if it didn't.
  wifiNextAttemptAt = now + WIFI_CONNECT_TIMEOUT_MS + wifiRetryDelay;
  wifiRetryDelay = nextDelay(wifiRetryDelay);
}

bool clockIsSet() {
  return time(nullptr) > 1700000000; // after 2023-11: NTP has answered
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  unsigned long now = millis();
  if ((long)(now - mqttNextAttemptAt) < 0) return;
  if (!clockIsSet()) return; // TLS certificate dates can't be checked yet

  char clientId[48];
  snprintf(clientId, sizeof(clientId), "enoise-%s-%04lx", NODE_ID, (unsigned long)(esp_random() & 0xffff));
  Serial.printf("[mqtt] Connecting as %s...\n", clientId);

  // Last Will: if the node disappears without saying goodbye, the broker
  // publishes this (retained) for us.
  const char* offlinePayload = "{\"online\":false}";
  bool ok = mqtt.connect(clientId, MQTT_USERNAME, MQTT_PASSWORD, statusTopic, 1, true, offlinePayload);

  if (ok) {
    Serial.println("[mqtt] Connected.");
    mqttRetryDelay = RETRY_MIN_MS;
    mqtt.subscribe(ledTopic, 1);
    mqtt.subscribe(audioRequestTopic, 1);
    mqtt.publish(statusTopic, "{\"online\":true}", true);
  } else {
    Serial.printf("[mqtt] Failed, rc=%d. Retrying in %lu s.\n", mqtt.state(), mqttRetryDelay / 1000);
    mqttNextAttemptAt = now + mqttRetryDelay;
    mqttRetryDelay = nextDelay(mqttRetryDelay);
  }
  restartLevelAfterBlocking(); // the TLS handshake blocked the loop
}

// ---------------------------------------------------------------------
// Sound level
// ---------------------------------------------------------------------
void resetLevelWindow() {
  levelSampleCount = 0;
  levelSum = 0;
  levelSumSq = 0;
  lastLevelSampleUs = micros();
}

// After the loop was blocked (audio capture, TLS handshake): start a fresh
// window and restart the filter, so the gap isn't seen as a sudden jump.
void restartLevelAfterBlocking() {
  resetLevelWindow();
  hpSeeded = false;
}

// One ADC sample if it is time for the next one. Never waits.
void sampleLevel() {
  unsigned long nowUs = micros();
  unsigned long dtUs = nowUs - lastLevelSampleUs;
  if ((long)dtUs < (long)LEVEL_SAMPLE_INTERVAL_US) return;
  lastLevelSampleUs = nowUs;
  // analogReadMilliVolts applies the chip's factory ADC calibration, so
  // the value is in real millivolts rather than raw counts.
  float mv = (float)analogReadMilliVolts(MIC_PIN);

  // First-order high-pass: out = a * (prevOut + in - prevIn). The loop's
  // sampling isn't perfectly regular, so a is computed from the real gap.
  float out = 0;
  if (hpSeeded) {
    float a = HPF_RC_US / (HPF_RC_US + (float)dtUs);
    out = a * (hpPrevOut + mv - hpPrevIn);
  }
  hpPrevIn = mv;
  hpPrevOut = out;
  hpSeeded = true;

  levelSum += out;
  levelSumSq += (double)out * (double)out;
  levelSampleCount++;
}

// Closes the one-second window. Returns false (no reading) when too few
// samples were collected. Otherwise *dbOut is the estimated level.
bool finishLevelWindow(float* dbOut) {
  uint32_t n = levelSampleCount;
  double sum = levelSum, sumSq = levelSumSq;
  resetLevelWindow();

  if (n < LEVEL_MIN_SAMPLES) {
    Serial.printf("[level] Only %lu samples this second (need %lu): reading skipped.\n", (unsigned long)n, (unsigned long)LEVEL_MIN_SAMPLES);
    return false;
  }

  // RMS of the AC part: sqrt(mean of squares - square of mean).
  double mean = sum / n;
  double variance = sumSq / n - mean * mean;
  if (variance < 0) variance = 0;
  float rmsMv = (float)sqrt(variance);
  lastRmsMv = rmsMv;

  *dbOut = rmsToDb(rmsMv);
  if (PRINT_RMS_MV) Serial.printf("[level] rms=%.2f mV -> %.1f dB (%lu samples)\n", rmsMv, *dbOut, (unsigned long)n);
  return true;
}

// Calibration mode: one line per second with the UNCORRECTED level (the
// server applies each node's offset/gain later). Copy these into the
// calibration CSV (docs/CALIBRATION.md).
void printCalibrationLine(float db) {
  Serial.printf("[cal] node=%s fw=%s raw_db=%.1f rms_mv=%.2f\n", NODE_ID, FIRMWARE_VERSION, db, lastRmsMv);
}

// Serial commands: "cal" (toggle), "cal on", "cal off". Read without waiting.
void handleSerialCommands() {
  static char line[16];
  static uint8_t len = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c != '\n') {
      if (len < sizeof(line) - 1) line[len++] = c;
      continue;
    }
    line[len] = '\0';
    len = 0;
    if (strcmp(line, "cal") == 0) calibrationMode = !calibrationMode;
    else if (strcmp(line, "cal on") == 0) calibrationMode = true;
    else if (strcmp(line, "cal off") == 0) calibrationMode = false;
    else continue;
    Serial.printf("[cal] Calibration mode %s: telemetry is %s.\n", calibrationMode ? "ON" : "OFF", calibrationMode ? "NOT published" : "published again");
  }
}

// Multi-point calibration: linear in 20*log10(mV) between table rows.
float rmsToDb(float rmsMv) {
  if (rmsMv < 0.01f) rmsMv = 0.01f; // avoid log(0)
  float x = 20.0f * log10f(rmsMv);

  int i = 0;
  while (i < CAL_POINTS - 2 && rmsMv > CAL_TABLE[i + 1].mv_rms) i++;
  float x0 = 20.0f * log10f(CAL_TABLE[i].mv_rms), y0 = CAL_TABLE[i].db;
  float x1 = 20.0f * log10f(CAL_TABLE[i + 1].mv_rms), y1 = CAL_TABLE[i + 1].db;
  float db = (x1 == x0) ? y0 : y0 + (x - x0) * (y1 - y0) / (x1 - x0);

  if (db < DB_FLOOR) db = DB_FLOOR;
  if (db > DB_CEIL) db = DB_CEIL;
  return db;
}

// ---------------------------------------------------------------------
// Telemetry: { "db_level": 52.3, "fw": "1.1.0" }
// No timestamp (no clock needed by the backend): it uses the arrival time.
// No classification: YAMNet runs on the server.
// ---------------------------------------------------------------------
void publishTelemetry(float dbLevel) {
  if (!mqtt.connected()) return; // readings while offline are skipped, not queued

  char payload[64];
  snprintf(payload, sizeof(payload), "{\"db_level\":%.1f,\"fw\":\"%s\"}", dbLevel, FIRMWARE_VERSION);
  mqtt.publish(telemetryTopic, payload, false);
}

// ---------------------------------------------------------------------
// Messages from the backend
// ---------------------------------------------------------------------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, audioRequestTopic) == 0) {
    audioCaptureRequested = true; // handled in loop()
    return;
  }
  if (strcmp(topic, ledTopic) != 0) return;

  // LED command: { "green": 5, "yellow": 3, "red": 0, "critical": false }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[mqtt] Bad LED payload: %s\n", err.c_str());
    return;
  }

  setLedRow(GREEN_PINS, 5, doc["green"] | 0);
  setLedRow(YELLOW_PINS, 3, doc["yellow"] | 0);
  setLedRow(RED_PINS, 2, doc["red"] | 0);
  ledCritical = doc["critical"] | false;
  if (!ledCritical) digitalWrite(CRITICAL_PIN, LOW);
  lastLedCommandAt = millis();
  ledFailsafeActive = false;
}

// ---------------------------------------------------------------------
// LEDs
// ---------------------------------------------------------------------
void setupLedPins() {
  for (int i = 0; i < 5; i++) pinMode(GREEN_PINS[i], OUTPUT);
  for (int i = 0; i < 3; i++) pinMode(YELLOW_PINS[i], OUTPUT);
  for (int i = 0; i < 2; i++) pinMode(RED_PINS[i], OUTPUT);
  pinMode(CRITICAL_PIN, OUTPUT);
}

void setLedRow(const int* pins, int count, int activeCount) {
  activeCount = constrain(activeCount, 0, count);
  for (int i = 0; i < count; i++) digitalWrite(pins[i], i < activeCount ? HIGH : LOW);
}

// The backend decides on/off; the blinking itself is done here so it
// doesn't depend on a steady connection.
void updateCriticalBlink() {
  if (!ledCritical) return;
  unsigned long now = millis();
  if (now - lastBlinkToggle >= 400) {
    lastBlinkToggle = now;
    blinkOn = !blinkOn;
    digitalWrite(CRITICAL_PIN, blinkOn ? HIGH : LOW);
  }
}

// If no LED command arrives for 30 s (backend or network down), turn the
// LEDs off instead of showing an old state forever.
void updateLedFailsafe() {
  if (ledFailsafeActive || millis() - lastLedCommandAt < LED_FAILSAFE_MS) return;
  setLedRow(GREEN_PINS, 5, 0);
  setLedRow(YELLOW_PINS, 3, 0);
  setLedRow(RED_PINS, 2, 0);
  ledCritical = false;
  blinkOn = false;
  digitalWrite(CRITICAL_PIN, LOW);
  ledFailsafeActive = true;
}

// ---------------------------------------------------------------------
// Audio clip for YAMNet: 1 s of 16 kHz 16-bit mono PCM in a WAV header.
// The buffer (32 KB) is freed on every path; nothing is stored. This is
// the one place the loop blocks (~1 s); the level window is reset after.
// ---------------------------------------------------------------------
void captureAndPublishAudio() {
  if (!mqtt.connected() || calibrationMode) return;

  const uint32_t dataBytes = AUDIO_NUM_SAMPLES * sizeof(int16_t);
  if (ESP.getMaxAllocHeap() < dataBytes + 4096) {
    Serial.println("[audio] Not enough free memory; capture skipped.");
    return;
  }
  int16_t* samples = (int16_t*)malloc(dataBytes);
  if (!samples) {
    Serial.println("[audio] malloc failed; capture skipped.");
    return;
  }

  const uint32_t sampleIntervalUs = 1000000UL / AUDIO_SAMPLE_RATE_HZ;
  unsigned long nextSampleAt = micros();
  const unsigned long captureStartedAt = micros();
  for (uint32_t i = 0; i < AUDIO_NUM_SAMPLES; i++) {
    while ((long)(micros() - nextSampleAt) < 0) {
      // wait for the next sample time (wrap-safe)
    }
    nextSampleAt += sampleIntervalUs;
    // Raw counts here (faster than the millivolt conversion); the DC
    // offset is removed below.
    samples[i] = (int16_t)(analogRead(MIC_PIN) * 8); // 12-bit ADC -> roughly 16-bit range
  }
  // Over ~1,050,000 us means analogRead is too slow for a true 16 kHz clip.
  Serial.printf("[audio] Capture took %lu us (target 1000000).\n", (unsigned long)(micros() - captureStartedAt));

  // Remove the DC offset (the mic output sits around mid-scale).
  int32_t sum = 0;
  for (uint32_t i = 0; i < AUDIO_NUM_SAMPLES; i++) sum += samples[i];
  const int32_t mean = sum / (int32_t)AUDIO_NUM_SAMPLES;
  for (uint32_t i = 0; i < AUDIO_NUM_SAMPLES; i++) {
    int32_t centered = (int32_t)samples[i] - mean;
    samples[i] = (int16_t)constrain(centered, (int32_t)INT16_MIN, (int32_t)INT16_MAX);
  }

  uint8_t header[44];
  buildWavHeader(header, dataBytes, AUDIO_SAMPLE_RATE_HZ);

  // Streamed publish: the 32 KB clip doesn't need a 32 KB MQTT buffer.
  bool ok = mqtt.beginPublish(audioTopic, sizeof(header) + dataBytes, false);
  if (ok) {
    ok = mqtt.write(header, sizeof(header)) == sizeof(header);
    ok = ok && mqtt.write((const uint8_t*)samples, dataBytes) == dataBytes;
    mqtt.endPublish();
    if (!ok) mqtt.disconnect(); // a half-sent message would corrupt the connection
  }
  free(samples);
  Serial.println(ok ? "[audio] Clip sent." : "[audio] Sending the clip failed.");
}

void buildWavHeader(uint8_t* header, uint32_t dataBytes, uint32_t sampleRate) {
  memcpy(header, "RIFF", 4);
  writeLE32(header + 4, 36 + dataBytes);
  memcpy(header + 8, "WAVE", 4);
  memcpy(header + 12, "fmt ", 4);
  writeLE32(header + 16, 16);             // fmt chunk size
  writeLE16(header + 20, 1);              // PCM
  writeLE16(header + 22, 1);              // mono
  writeLE32(header + 24, sampleRate);
  writeLE32(header + 28, sampleRate * 2); // byte rate (16-bit mono)
  writeLE16(header + 32, 2);              // block align
  writeLE16(header + 34, 16);             // bits per sample
  memcpy(header + 36, "data", 4);
  writeLE32(header + 40, dataBytes);
}

void writeLE32(uint8_t* p, uint32_t v) {
  p[0] = v & 0xFF;
  p[1] = (v >> 8) & 0xFF;
  p[2] = (v >> 16) & 0xFF;
  p[3] = (v >> 24) & 0xFF;
}

void writeLE16(uint8_t* p, uint16_t v) {
  p[0] = v & 0xFF;
  p[1] = (v >> 8) & 0xFF;
}
