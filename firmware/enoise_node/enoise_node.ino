/*
 * Project E-Noise - ESP32 sensor node firmware
 * ---------------------------------------------
 * One node per table. Each node:
 *   1. Samples the MAX9814 microphone and estimates a sound level in dB.
 *   2. Publishes that reading over MQTT (TLS) once per second.
 *   3. Drives the 11 LEDs (5 green / 3 yellow / 2 red / 1 critical) exactly
 *      as the backend tells it on the LED topic. The node never decides the
 *      LED state itself: the 10-second critical confirmation runs on the
 *      server (server/src/services/telemetryService.js).
 *   4. Publishes a retained {"online":true} status and sets {"online":false}
 *      as its MQTT Last Will, so the dashboard sees power/Wi-Fi loss.
 *   5. When the backend asks (only while the table is already loud), records
 *      ~1 second of audio and sends it as a WAV clip for YAMNet
 *      classification. The clip only lives in RAM and is freed right after.
 *
 * Setup:
 *   - Copy secrets.example.h to secrets.h and fill in Wi-Fi + HiveMQ details.
 *   - Board: "ESP32 Dev Module" (ESP32-WROOM-32 / DevKitV1).
 *   - Libraries: PubSubClient (Nick O'Leary) 2.8, ArduinoJson (Benoit Blanchon) 7.x.
 *   - Compile: arduino-cli compile --fqbn esp32:esp32:esp32 firmware/enoise_node
 *
 * Wiring:
 *   MAX9814 OUT -> GPIO34 (ADC1, input-only, works while Wi-Fi is on)
 *   MAX9814 VCC -> 3V3, GND -> GND, GAIN pin floating (60 dB gain)
 *   11 LEDs, each through a 220-330 ohm resistor to GND, anodes to:
 *     Green:    GPIO 4, 5, 18, 19, 21
 *     Yellow:   GPIO 22, 23, 32
 *     Red:      GPIO 25, 26
 *     Critical: GPIO 27 (blinks locally while the backend says "critical")
 *
 * Connection handling: nothing in loop() waits for Wi-Fi or MQTT. Each
 * reconnect attempt is spaced out with a growing delay (2 s, 4 s, 8 s ...
 * up to 60 s), so the LEDs keep working while the network is down.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.h is missing: copy secrets.example.h to secrets.h and fill in your Wi-Fi and HiveMQ details."
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
// GPIO5 is a boot strapping pin; an LED load on it is fine at boot.
const int GREEN_PINS[5] = {4, 5, 18, 19, 21};
const int YELLOW_PINS[3] = {22, 23, 32};
const int RED_PINS[2] = {25, 26};
const int CRITICAL_PIN = 27;

// ---------------------------------------------------------------------
// Sound level estimate - NOT CALIBRATED
// ---------------------------------------------------------------------
// The value sent as "db_level" is only an estimate: it takes the
// peak-to-peak microphone voltage over a 50 ms window and converts it to
// dB using ONE assumed reference point (MIC_REF_VOLTAGE = MIC_REF_DB).
// These two numbers are guesses and have NOT been measured. Until they are
// set by comparing against a real sound level meter at a known volume,
// treat the dB values as relative ("louder/quieter"), not as true dB(A)
// (there is also no A-weighting filter). Thresholds in the dashboard must
// be tuned against these uncalibrated values.
const unsigned long SAMPLE_WINDOW_MS = 50;
const float ADC_MAX_VOLTAGE = 3.3f;
const float MIC_REF_VOLTAGE = 0.02f; // UNCALIBRATED: peak-to-peak volts assumed at MIC_REF_DB
const float MIC_REF_DB = 40.0f;      // UNCALIBRATED: dB assumed at MIC_REF_VOLTAGE
const float DB_FLOOR = 30.0f;
const float DB_CEIL = 100.0f;

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

void setup() {
  Serial.begin(115200);

  snprintf(telemetryTopic, sizeof(telemetryTopic), "enoise/%s/telemetry", NODE_ID);
  snprintf(statusTopic, sizeof(statusTopic), "enoise/%s/status", NODE_ID);
  snprintf(ledTopic, sizeof(ledTopic), "enoise/%s/led", NODE_ID);
  snprintf(audioRequestTopic, sizeof(audioRequestTopic), "enoise/%s/audio-request", NODE_ID);
  snprintf(audioTopic, sizeof(audioTopic), "enoise/%s/audio", NODE_ID);

  setupLedPins();
  analogReadResolution(12);
  analogSetPinAttenuation(MIC_PIN, ADC_11db);
  lastLedCommandAt = millis();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  // NOTE: setInsecure() skips checking the broker's TLS certificate. The
  // connection is still encrypted, but for a real deployment load the
  // broker's CA certificate with tlsClient.setCACert(...) instead.
  tlsClient.setInsecure();
  tlsClient.setTimeout(10); // seconds; a stuck TLS handshake can't block for long
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);
}

void loop() {
  maintainWifi();
  maintainMqtt();
  if (mqtt.connected()) mqtt.loop();

  // The ~1 s capture runs here, never inside the MQTT callback.
  if (audioCaptureRequested) {
    audioCaptureRequested = false;
    captureAndPublishAudio();
  }

  updateCriticalBlink();
  updateLedFailsafe();

  unsigned long now = millis();
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    float db = sampleDbLevel();
    publishTelemetry(db);
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
  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryDelay = RETRY_MIN_MS;
    return;
  }
  unsigned long now = millis();
  if ((long)(now - wifiNextAttemptAt) < 0) return; // still waiting before the next try

  Serial.printf("[wifi] Connecting to %s (next retry in %lu s)...\n", WIFI_SSID, (WIFI_CONNECT_TIMEOUT_MS + wifiRetryDelay) / 1000);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // Give this attempt time to finish, then back off further if it didn't.
  wifiNextAttemptAt = now + WIFI_CONNECT_TIMEOUT_MS + wifiRetryDelay;
  wifiRetryDelay = nextDelay(wifiRetryDelay);
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  unsigned long now = millis();
  if ((long)(now - mqttNextAttemptAt) < 0) return;

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
}

// ---------------------------------------------------------------------
// Telemetry: { "db_level": 52.3 }
// No timestamp (no clock on the board): the backend uses the arrival time.
// No classification: YAMNet runs on the server.
// ---------------------------------------------------------------------
float sampleDbLevel() {
  unsigned long start = millis();
  int minVal = 4095, maxVal = 0;
  while (millis() - start < SAMPLE_WINDOW_MS) {
    int v = analogRead(MIC_PIN);
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  float peakToPeakVoltage = ((maxVal - minVal) / 4095.0f) * ADC_MAX_VOLTAGE;
  if (peakToPeakVoltage < 0.001f) peakToPeakVoltage = 0.001f; // avoid log(0)

  float db = MIC_REF_DB + 20.0f * log10f(peakToPeakVoltage / MIC_REF_VOLTAGE);
  if (db < DB_FLOOR) db = DB_FLOOR;
  if (db > DB_CEIL) db = DB_CEIL;
  return db;
}

void publishTelemetry(float dbLevel) {
  if (!mqtt.connected()) return; // readings while offline are skipped, not queued

  char payload[48];
  snprintf(payload, sizeof(payload), "{\"db_level\":%.1f}", dbLevel);
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
// The buffer (32 KB) is freed on every path; nothing is stored.
// ---------------------------------------------------------------------
void captureAndPublishAudio() {
  if (!mqtt.connected()) return;

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
