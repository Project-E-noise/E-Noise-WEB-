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

// Messages from the same node are handled one after another (in order), so
// the confirmation rule never runs twice at once for one table. Different
// nodes still run in parallel.
const nodeQueues = new Map();
function runInOrder(nodeId, task) {
  const previous = nodeQueues.get(nodeId) || Promise.resolve();
  const next = previous.then(task).catch(err => console.error(`[mqtt] Failed to process message from ${nodeId}:`, err.message));
  nodeQueues.set(nodeId, next);
  next.finally(() => {
    if (nodeQueues.get(nodeId) === next) nodeQueues.delete(nodeId);
  });
  return next;
}

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
    protocol: env.hivemq.protocol,
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

  client.on("message", (topic, payload, packet) => {
    const nodeId = nodeIdFromTopic(topic);
    if (!nodeId) return;

    if (topic.endsWith("/telemetry")) {
      const parsed = parseTelemetry(payload);
      if (parsed.error) return console.warn(`[mqtt] Bad telemetry from ${nodeId}: ${parsed.error}`);
      runInOrder(nodeId, () => ingestTelemetry(nodeId, parsed));
    } else if (topic.endsWith("/status")) {
      const parsed = parseStatus(payload);
      if (parsed.error) return console.warn(`[mqtt] Bad status from ${nodeId}: ${parsed.error}`);
      // A retained status is the broker replaying an old message (e.g. right
      // after the API restarts), not proof that the node is alive now.
      runInOrder(nodeId, () => ingestStatus(nodeId, parsed, { retained: Boolean(packet?.retain) }));
    } else if (topic.endsWith("/audio")) {
      // Binary WAV clip. Classification can take seconds (or the ML
      // service may be asleep), so it does not hold up the telemetry queue.
      // The buffer only lives in memory; it is never written to disk.
      ingestAudioClip(nodeId, payload).catch(err => console.error(`[mqtt] Audio from ${nodeId} failed:`, err.message));
    }
  });

  return client;
}

/** Closes the broker connection (used on shutdown). */
export function disconnectMqtt() {
  return new Promise(resolve => (client ? client.end(false, {}, resolve) : resolve()));
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
