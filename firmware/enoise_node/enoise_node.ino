/*
 * Project E-Noise — ESP32 sensor node firmware
 * ---------------------------------------------
 * One of these runs per table (7 total on Studify's 2nd floor). Each node:
 *   1. Samples the MAX9814 electret mic and estimates a dB(A)-ish SPL value.
 *   2. Publishes that reading over MQTT (TLS) to the backend, once per
 *      TELEMETRY_INTERVAL_MS.
 *   3. Subscribes to a backend-published LED command topic and drives the
 *      10-indicator LED array (5 green / 2 yellow / 2 red / 1 critical)
 *      to match it. The device NEVER decides the LED state itself — see
 *      "CRITICAL LED RULE" in the spec: the 10-second confirmation logic
 *      lives entirely in the backend (server/src/services/telemetryService.js).
 *   4. Publishes a retained online/offline status message, and sets that
 *      same topic as its MQTT Last Will, so the backend finds out
 *      immediately if a node loses power or WiFi ungracefully.
 *   5. (Phase 7) When the backend asks for one (only while this table is
 *      already at/above its warning threshold — never continuously), records
 *      ~1 second of raw audio and publishes it as a WAV clip for server-side
 *      YAMNet classification. The clip lives in RAM only: it's built,
 *      published, and immediately discarded — this device never writes
 *      audio to flash/SD, matching the spec's "no raw audio storage" rule.
 *
 * Boards tested against: ESP32 DevKitV1 (any similar ESP32-WROOM-32 board
 * should work unchanged).
 *
 * Libraries (install via Arduino Library Manager):
 *   - PubSubClient   by Nick O'Leary
 *   - ArduinoJson    by Benoit Blanchon (v6 or v7)
 *   (WiFi.h / WiFiClientSecure.h ship with the ESP32 Arduino core.)
 *
 * Wiring:
 *   MAX9814 OUT -> GPIO34 (ADC1, input-only — safe during WiFi/BT use)
 *   MAX9814 VCC -> 3V3, GND -> GND, GAIN pin left floating (60dB gain)
 *   10 LEDs, each through a ~220-330 ohm resistor to GND, anodes to:
 *     Green:    GPIO 4, 5, 18, 19, 21
 *     Yellow:   GPIO 22, 23
 *     Red:      GPIO 25, 26
 *     Critical: GPIO 27 (this one blinks — backend controls on/off, the
 *               blink animation itself is local so it doesn't depend on a
 *               steady MQTT connection to visibly blink)
 *
 * IMPORTANT: the dB conversion below is a *starting point*, not a
 * calibrated SPL meter. Calibrate MIC_REF_DB / MIC_REF_VOLTAGE against a
 * real sound level meter at a known volume before trusting absolute
 * numbers for the thresholds configured in the dashboard.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------------
// CONFIG — fill these in per node before flashing. Keep this file out of
// version control once real credentials are in it (see .gitignore note
// at the bottom), or move these into a separate secrets.h you .gitignore.
// ---------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_HOST     = "xxxxxxxx.s1.eu.hivemq.cloud"; // matches server/.env HIVEMQ_HOST
const int   MQTT_PORT     = 8883;                          // TLS
const char* MQTT_USERNAME = "YOUR_HIVEMQ_USERNAME";
const char* MQTT_PASSWORD = "YOUR_HIVEMQ_PASSWORD";

// Must exactly match this table's sensor_node_id in Table Configuration.
const char* NODE_ID = "NODE-001";

const unsigned long TELEMETRY_INTERVAL_MS = 1000;   // one reading per second
const unsigned long RECONNECT_BACKOFF_MS  = 3000;

// Phase 7: audio capture for YAMNet classification, triggered by the
// backend (never continuously — only while this table is already loud
// enough to matter, see telemetryService.js's maybeRequestAudio()).
const uint32_t AUDIO_SAMPLE_RATE_HZ = 16000; // YAMNet's native input rate
const uint32_t AUDIO_CLIP_SECONDS   = 1;
const uint32_t AUDIO_NUM_SAMPLES    = AUDIO_SAMPLE_RATE_HZ * AUDIO_CLIP_SECONDS;
const uint32_t MQTT_BUFFER_BYTES    = (AUDIO_NUM_SAMPLES * 2) + 100; // PCM16 + WAV header + margin

// ---------------------------------------------------------------------
// Pin map
// ---------------------------------------------------------------------
const int MIC_PIN = 34;

const int GREEN_PINS[5]  = {4, 5, 18, 19, 21};
const int YELLOW_PINS[2] = {22, 23};
const int RED_PINS[2]    = {25, 26};
const int CRITICAL_PIN   = 27;

// ---------------------------------------------------------------------
// Mic -> approximate dB(A) SPL calibration
// Sample the raw envelope for a short window, take peak-to-peak voltage,
// convert to a dB value anchored at a reference point. Adjust the two
// constants below after comparing against a real SPL meter.
// ---------------------------------------------------------------------
const unsigned long SAMPLE_WINDOW_MS = 50;
const float ADC_MAX_VOLTAGE   = 3.3f;
const float MIC_REF_VOLTAGE   = 0.02f; // peak-to-peak volts observed at MIC_REF_DB
const float MIC_REF_DB        = 40.0f; // dB(A) measured at MIC_REF_VOLTAGE (calibrate!)
const float DB_FLOOR          = 30.0f;
const float DB_CEIL           = 100.0f;

// ---------------------------------------------------------------------

WiFiClientSecure tlsClient;
PubSubClient mqtt(tlsClient);

String telemetryTopic, statusTopic, ledTopic, audioRequestTopic, audioTopic;

bool ledCritical = false;
unsigned long lastBlinkToggle = 0;
bool blinkOn = false;
unsigned long lastTelemetryAt = 0;
volatile bool audioCaptureRequested = false;

void setup() {
  Serial.begin(115200);

  telemetryTopic   = String("enoise/") + NODE_ID + "/telemetry";
  statusTopic      = String("enoise/") + NODE_ID + "/status";
  ledTopic         = String("enoise/") + NODE_ID + "/led";
  audioRequestTopic = String("enoise/") + NODE_ID + "/audio-request";
  audioTopic        = String("enoise/") + NODE_ID + "/audio";

  setupLedPins();
  connectWifi();

  // NOTE: for a production deployment, pin the broker's CA certificate
  // instead of skipping verification. setInsecure() is fine to get a
  // capstone demo running quickly; swap it out before trusting this on a
  // network you don't control.
  tlsClient.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  // Default PubSubClient buffer (256 bytes) is far too small for a WAV
  // clip (~32 KB) — this is the single most common thing people forget
  // when adding audio to an existing PubSubClient project.
  mqtt.setBufferSize(MQTT_BUFFER_BYTES);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  // Handled here (not inside onMqttMessage) so the capture — which blocks
  // for ~1s — never runs from inside PubSubClient's own callback context.
  if (audioCaptureRequested) {
    audioCaptureRequested = false;
    captureAndPublishAudio();
  }

  updateCriticalBlink();

  unsigned long now = millis();
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    publishTelemetry(sampleDbLevel());
  }
}

// ---------------------------------------------------------------------
// WiFi / MQTT connection handling
// ---------------------------------------------------------------------
void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[wifi] Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\n[wifi] Connected." : "\n[wifi] Failed, will retry in loop().");
}

void connectMqtt() {
  static unsigned long lastAttempt = 0;
  if (millis() - lastAttempt < RECONNECT_BACKOFF_MS) return;
  lastAttempt = millis();

  Serial.println("[mqtt] Connecting...");
  String clientId = String("enoise-") + NODE_ID + "-" + String(random(0xffff), HEX);

  // Last Will: if this node drops off the network ungracefully, the broker
  // publishes {"online":false} on our behalf, retained, so the dashboard
  // finds out even without a graceful disconnect.
  StaticJsonDocument<32> willDoc;
  willDoc["online"] = false;
  char willPayload[32];
  serializeJson(willDoc, willPayload);

  bool ok = mqtt.connect(
    clientId.c_str(),
    MQTT_USERNAME,
    MQTT_PASSWORD,
    statusTopic.c_str(),
    1,     // will QoS
    true,  // will retained
    willPayload
  );

  if (ok) {
    Serial.println("[mqtt] Connected.");
    mqtt.subscribe(ledTopic.c_str(), 1);
    mqtt.subscribe(audioRequestTopic.c_str(), 1);

    StaticJsonDocument<32> onlineDoc;
    onlineDoc["online"] = true;
    char onlinePayload[32];
    serializeJson(onlineDoc, onlinePayload);
    mqtt.publish(statusTopic.c_str(), onlinePayload, true /* retained */);
  } else {
    Serial.printf("[mqtt] Connect failed, rc=%d. Retrying...\n", mqtt.state());
  }
}

// ---------------------------------------------------------------------
// Telemetry: sample the mic, publish { db_level, timestamp }.
// classification/confidence are intentionally omitted — this device does
// not run on-device inference; YAMNet classification happens server-side
// (Phase 7). The backend's parseTelemetry() treats them as optional.
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

  float db = MIC_REF_DB + 20.0f * log10(peakToPeakVoltage / MIC_REF_VOLTAGE);
  if (db < DB_FLOOR) db = DB_FLOOR;
  if (db > DB_CEIL) db = DB_CEIL;
  return db;
}

void publishTelemetry(float dbLevel) {
  if (!mqtt.connected()) return;

  StaticJsonDocument<128> doc;
  doc["db_level"] = roundf(dbLevel * 10) / 10.0f;
  // No RTC on this board — the backend uses its own receipt time when
  // "timestamp" is omitted. Add an NTP-synced timestamp here if the node
  // has one.

  char payload[128];
  serializeJson(doc, payload);
  mqtt.publish(telemetryTopic.c_str(), payload, false);
}

// ---------------------------------------------------------------------
// LED command handling — backend is authoritative. This device only
// renders whatever { green, yellow, red, critical } it's told.
// ---------------------------------------------------------------------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String topicStr(topic);

  if (topicStr == audioRequestTopic) {
    // Just set a flag — the actual ~1s blocking capture happens in loop(),
    // never inside this callback (PubSubClient callbacks should stay short).
    audioCaptureRequested = true;
    return;
  }

  if (topicStr != ledTopic) return; // ignore anything unexpected

  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[mqtt] Bad LED payload: %s\n", err.c_str());
    return;
  }

  setLedRow(GREEN_PINS, 5, doc["green"] | 0);
  setLedRow(YELLOW_PINS, 2, doc["yellow"] | 0);
  setLedRow(RED_PINS, 2, doc["red"] | 0);
  ledCritical = doc["critical"] | false;
  if (!ledCritical) digitalWrite(CRITICAL_PIN, LOW);
}

void setupLedPins() {
  for (int i = 0; i < 5; i++) pinMode(GREEN_PINS[i], OUTPUT);
  for (int i = 0; i < 2; i++) pinMode(YELLOW_PINS[i], OUTPUT);
  for (int i = 0; i < 2; i++) pinMode(RED_PINS[i], OUTPUT);
  pinMode(CRITICAL_PIN, OUTPUT);
}

void setLedRow(const int* pins, int count, int activeCount) {
  activeCount = constrain(activeCount, 0, count);
  for (int i = 0; i < count; i++) digitalWrite(pins[i], i < activeCount ? HIGH : LOW);
}

// The single critical bulb blinks locally once the backend has confirmed
// it — the blink animation itself doesn't need a live MQTT round-trip per
// toggle, only the on/off decision does (which is exactly what the
// backend's 10-second confirmation rule controls).
void updateCriticalBlink() {
  if (!ledCritical) return;
  unsigned long now = millis();
  if (now - lastBlinkToggle >= 400) {
    lastBlinkToggle = now;
    blinkOn = !blinkOn;
    digitalWrite(CRITICAL_PIN, blinkOn ? HIGH : LOW);
  }
}

// ---------------------------------------------------------------------
// Phase 7: audio capture for server-side YAMNet classification.
// Records exactly AUDIO_NUM_SAMPLES (1s @ 16kHz) into a heap buffer,
// wraps it in a minimal 44-byte WAV header, publishes it once, then frees
// the buffer immediately — nothing is ever written to flash/SD, and
// nothing lingers in RAM past this single publish (see the "no raw audio
// storage" note at the top of this file).
// ---------------------------------------------------------------------
void captureAndPublishAudio() {
  if (!mqtt.connected()) return;

  int16_t* samples = (int16_t*)malloc(AUDIO_NUM_SAMPLES * sizeof(int16_t));
  if (!samples) {
    Serial.println("[audio] malloc failed — skipping this capture.");
    return;
  }

  Serial.println("[audio] Capturing 1s clip...");
  const uint32_t sampleIntervalUs = 1000000UL / AUDIO_SAMPLE_RATE_HZ;
  unsigned long nextSampleAt = micros();

  for (uint32_t i = 0; i < AUDIO_NUM_SAMPLES; i++) {
    while (micros() < nextSampleAt) { /* busy-wait for precise sample timing */
    }
    nextSampleAt += sampleIntervalUs;

    // ESP32 ADC is 12-bit (0-4095), centered around ~2048 for an
    // AC-coupled mic signal. Shift into a signed 16-bit range for
    // standard PCM16 WAV — this is the same calibration point used by
    // sampleDbLevel(), just recorded as a waveform instead of a min/max
    // envelope.
    int raw = analogRead(MIC_PIN);
    samples[i] = (int16_t)((raw - 2048) * 16);
  }

  uint32_t dataBytes = AUDIO_NUM_SAMPLES * sizeof(int16_t);
  uint8_t header[44];
  buildWavHeader(header, dataBytes, AUDIO_SAMPLE_RATE_HZ);

  // PubSubClient has no streaming publish API — build the full frame
  // (header + samples) into one buffer sized to MQTT_BUFFER_BYTES and
  // publish it in one call.
  static uint8_t* frame = nullptr;
  if (!frame) frame = (uint8_t*)malloc(MQTT_BUFFER_BYTES);
  if (!frame) {
    Serial.println("[audio] frame malloc failed — skipping this capture.");
    free(samples);
    return;
  }

  memcpy(frame, header, 44);
  memcpy(frame + 44, samples, dataBytes);
  free(samples); // done with the raw samples the moment they're copied into frame

  bool ok = mqtt.publish(audioTopic.c_str(), frame, 44 + dataBytes, false);
  Serial.printf("[audio] Published %lu bytes: %s\n", (unsigned long)(44 + dataBytes), ok ? "ok" : "FAILED (check MQTT_BUFFER_BYTES / broker max message size)");
  // `frame` is reused (not freed) across captures to avoid heap
  // fragmentation from repeated malloc/free of the same large block.
}

void buildWavHeader(uint8_t* header, uint32_t dataBytes, uint32_t sampleRate) {
  uint32_t byteRate = sampleRate * 2; // mono, 16-bit
  uint32_t chunkSize = 36 + dataBytes;

  memcpy(header, "RIFF", 4);
  writeLE32(header + 4, chunkSize);
  memcpy(header + 8, "WAVE", 4);
  memcpy(header + 12, "fmt ", 4);
  writeLE32(header + 16, 16);              // fmt chunk size
  writeLE16(header + 20, 1);               // PCM
  writeLE16(header + 22, 1);               // mono
  writeLE32(header + 24, sampleRate);
  writeLE32(header + 28, byteRate);
  writeLE16(header + 32, 2);               // block align
  writeLE16(header + 34, 16);              // bits per sample
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
