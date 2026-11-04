import mqtt from "mqtt";
import { env } from "../config/env.js";
import {
  TELEMETRY_SUBSCRIBE_FILTER,
  STATUS_SUBSCRIBE_FILTER,
  AUDIO_SUBSCRIBE_FILTER,
  nodeIdFromTopic,
  parseTelemetry,
  parseStatus,
  ledTopic,
  buildLedPayload,
  audioRequestTopic,
  buildAudioRequestPayload
} from "./topics.js";
import { ingestTelemetry, ingestStatus, ingestAudioClip } from "../services/telemetryService.js";

let client = null;

/**
 * Connects to HiveMQ Cloud over TLS and subscribes to every node's
 * telemetry/status topics. If HIVEMQ_HOST isn't configured (no hardware
 * yet), this logs a warning and does nothing else — the REST API and
 * dashboard work fine without it; only live device data is unavailable.
 */
export function connectMqtt() {
  if (!env.hivemq.host) {
    // eslint-disable-next-line no-console
    console.warn("[mqtt] HIVEMQ_HOST is not set — skipping MQTT connection. Set it in server/.env once hardware is available.");
    return null;
  }

  client = mqtt.connect({
    host: env.hivemq.host,
    port: env.hivemq.port,
    // Defaults to TLS (HiveMQ Cloud). MQTT_PROTOCOL=mqtt lets local testing
    // point at a plain, non-TLS broker (e.g. a local Mosquitto instance)
    // without touching the production HiveMQ Cloud path.
    protocol: process.env.MQTT_PROTOCOL || "mqtts",
    username: env.hivemq.username || undefined,
    password: env.hivemq.password || undefined,
    clientId: `enoise-backend-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 3000
  });

  client.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log(`[mqtt] Connected to ${env.hivemq.host}:${env.hivemq.port}`);
    client.subscribe([TELEMETRY_SUBSCRIBE_FILTER, STATUS_SUBSCRIBE_FILTER, AUDIO_SUBSCRIBE_FILTER], { qos: 1 }, err => {
      if (err) console.error("[mqtt] Subscribe failed:", err.message);
      // eslint-disable-next-line no-console
      else console.log(`[mqtt] Subscribed: ${TELEMETRY_SUBSCRIBE_FILTER}, ${STATUS_SUBSCRIBE_FILTER}, ${AUDIO_SUBSCRIBE_FILTER}`);
    });
  });

  client.on("reconnect", () => console.warn("[mqtt] Reconnecting..."));
  client.on("error", err => console.error("[mqtt] Connection error:", err.message));
  client.on("offline", () => console.warn("[mqtt] Broker connection offline."));

  client.on("message", async (topic, payload) => {
    const nodeId = nodeIdFromTopic(topic);
    if (!nodeId) return;

    try {
      if (topic.endsWith("/telemetry")) {
        const parsed = parseTelemetry(payload);
        if (parsed.error) return console.warn(`[mqtt] Bad telemetry from ${nodeId}: ${parsed.error}`);
        await ingestTelemetry(nodeId, parsed);
      } else if (topic.endsWith("/status")) {
        const parsed = parseStatus(payload);
        if (parsed.error) return console.warn(`[mqtt] Bad status from ${nodeId}: ${parsed.error}`);
        await ingestStatus(nodeId, parsed);
      } else if (topic.endsWith("/audio")) {
        // Binary WAV payload, not JSON — passed straight through to the
        // classifier. See topics.js's isLikelyWav doc comment: this buffer
        // is only ever held in memory, never written to disk or the DB.
        await ingestAudioClip(nodeId, payload);
      }
    } catch (err) {
      // A single malformed/unexpected message must never crash the broker
      // connection — log and keep listening for the next one.
      // eslint-disable-next-line no-console
      console.error(`[mqtt] Failed to process message on ${topic}:`, err.message);
    }
  });

  return client;
}

/**
 * Publishes the authoritative LED state back to a device (retained, so a
 * device that reconnects picks up the current state immediately). Silently
 * no-ops if MQTT isn't connected — the dashboard/REST state is unaffected
 * either way, only the physical bulbs won't update.
 */
export function publishLedState(nodeId, ledState) {
  if (!client || !client.connected) return;
  client.publish(ledTopic(nodeId), buildLedPayload(ledState), { qos: 1, retain: true });
}

/**
 * Asks a device to capture and publish one audio clip now (Phase 7). Not
 * retained — it's a one-off instruction, not standing state. Silently
 * no-ops if MQTT isn't connected, same as publishLedState.
 */
export function requestAudioClip(nodeId) {
  if (!client || !client.connected) return;
  client.publish(audioRequestTopic(nodeId), buildAudioRequestPayload(), { qos: 1 });
}
