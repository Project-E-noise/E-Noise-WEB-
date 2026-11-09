// Project E-Noise MQTT topic & payload schema (Phase 5).
//
// Topics are namespaced under "enoise/<sensor_node_id>/..." — sensor_node_id
// is the same string already stored on the `tables` row (e.g. "NODE-004")
// and configured on the device itself, so no separate device registry is
// needed beyond the existing tables table.
//
//   enoise/<node>/telemetry      device -> backend   raw dB (+ optional ML)
//   enoise/<node>/status         device -> backend   online/offline (retained + LWT)
//   enoise/<node>/led            backend -> device    authoritative LED state
//   enoise/<node>/audio-request  backend -> device    "capture and send one clip now" (Phase 7)
//   enoise/<node>/audio          device -> backend    binary WAV clip for YAMNet classification (Phase 7)
//
// Backend subscribes with single-level wildcards: "enoise/+/telemetry",
// "enoise/+/status" and "enoise/+/audio". QoS 1 everywhere — readings can't
// get lost, but a duplicate delivery is harmless (each is just another
// noise_readings row, or one extra classification call).

export const TOPIC_PREFIX = "enoise";

export function telemetryTopic(nodeId) {
  return `${TOPIC_PREFIX}/${nodeId}/telemetry`;
}
export function statusTopic(nodeId) {
  return `${TOPIC_PREFIX}/${nodeId}/status`;
}
export function ledTopic(nodeId) {
  return `${TOPIC_PREFIX}/${nodeId}/led`;
}
export function audioRequestTopic(nodeId) {
  return `${TOPIC_PREFIX}/${nodeId}/audio-request`;
}
export function audioTopic(nodeId) {
  return `${TOPIC_PREFIX}/${nodeId}/audio`;
}

export const TELEMETRY_SUBSCRIBE_FILTER = `${TOPIC_PREFIX}/+/telemetry`;
export const STATUS_SUBSCRIBE_FILTER = `${TOPIC_PREFIX}/+/status`;
export const AUDIO_SUBSCRIBE_FILTER = `${TOPIC_PREFIX}/+/audio`;

export const ML_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Impact Noise", "Ambient Baseline"];

/**
 * Extract the node id from a topic that matched one of the wildcard filters
 * above, e.g. "enoise/NODE-004/telemetry" -> "NODE-004". Returns null if the
 * topic doesn't have the expected shape.
 */
export function nodeIdFromTopic(topic) {
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX) return null;
  return parts[1];
}

/**
 * Telemetry payload published by the device, once per sample:
 *   {
 *     "db_level": 62.4,               // required, dB(A) SPL from the MAX9814 front-end
 *     "classification": "Loud Conversation",   // optional — omit if the device
 *     "confidence": 0.87,                      //   doesn't run on-device inference;
 *                                               //   YAMNet runs server-side (Phase 7)
 *     "timestamp": "2026-09-17T10:15:00Z"       // optional, device RTC/NTP time (ISO 8601)
 *   }
 * Only db_level is required. Anything else missing/invalid is dropped, not
 * rejected — a device with no RTC just gets server receipt time instead.
 */
export function parseTelemetry(raw) {
  let data;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    return { error: "Payload is not valid JSON." };
  }

  const db_level = Number(data.db_level);
  if (!Number.isFinite(db_level)) return { error: "db_level is required and must be a number." };

  let classification = null;
  if (data.classification != null) {
    classification = String(data.classification);
    if (!ML_CATEGORIES.includes(classification)) classification = null;
  }

  let confidence = null;
  if (data.confidence != null && Number.isFinite(Number(data.confidence))) {
    confidence = Number(data.confidence);
  }

  let timestamp = null;
  if (data.timestamp) {
    const parsed = new Date(data.timestamp);
    if (!Number.isNaN(parsed.getTime())) timestamp = parsed.toISOString();
  }

  return { db_level, classification, confidence, timestamp };
}

/**
 * Status payload, retained on the broker and also used as the device's MQTT
 * Last Will (so a dropped connection reports itself offline automatically):
 *   { "online": true }
 */
export function parseStatus(raw) {
  try {
    const data = JSON.parse(raw.toString("utf8"));
    return { online: Boolean(data.online) };
  } catch {
    return { error: "Payload is not valid JSON." };
  }
}

/**
 * LED command the backend publishes back to the device (retained), so the
 * physical 11-LED array always reflects the same authoritative state the
 * dashboard shows — the device never decides this itself:
 *   { "green": 5, "yellow": 3, "red": 0, "critical": false }
 */
export function buildLedPayload({ green, yellow, red, critical }) {
  return JSON.stringify({ green, yellow, red, critical: Boolean(critical) });
}

/**
 * Phase 7 audio capture request (backend -> device). Trivial/empty payload —
 * the topic itself is the instruction, nothing to configure per-request.
 * Not retained: it's a one-off "do this now", not a standing state.
 */
export function buildAudioRequestPayload() {
  return JSON.stringify({ request: "capture" });
}

/**
 * Phase 7 audio clip (device -> backend): a raw WAV file, mono 16-bit PCM
 * at 16 kHz (YAMNet's native input rate), ~1 second long. Sent as a binary
 * MQTT payload, NOT JSON — mqttClient.js passes the Buffer straight through
 * to the ML service unmodified. Per the spec's "no raw audio storage" rule,
 * this buffer is only ever held in memory long enough to forward it to the
 * classifier (server/src/services/mlClient.js) and is never written to
 * disk or the database — only the resulting {category, confidence} is.
 */
export function isLikelyWav(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 44 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
}
