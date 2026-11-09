// Dev/test-only tool: publishes MQTT messages shaped exactly like a real
// ESP32 + MAX9814 node would, so the whole ingestion -> confirmation ->
// WebSocket pipeline can be exercised before real hardware exists.
//
// This is a separate script that talks to the broker directly — it is NOT
// part of the frontend or the backend's runtime code path, so it doesn't
// conflict with the spec's "do not fake sensor values in the frontend"
// rule: the frontend only ever renders whatever the backend/API reports,
// and this script produces the exact same kind of message real hardware
// would publish, over the same MQTT contract.
//
// Usage (from server/):
//   npm run simulate                          # NODE-001, gentle random walk
//   npm run simulate -- --node NODE-002 --spike   # walk up into a confirmed critical event
//   npm run simulate -- --spike --seconds 40       # stop by itself after 40 seconds
//
import mqtt from "mqtt";
import dotenv from "dotenv";
import { telemetryTopic, statusTopic } from "../src/mqtt/topics.js";

dotenv.config();

const args = process.argv.slice(2);
const nodeId = argOf("--node") || "NODE-001";
const doSpike = args.includes("--spike");
const stopAfterSeconds = Number(argOf("--seconds")) || 0;

function argOf(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
}

if (!process.env.HIVEMQ_HOST) {
  console.error("[simulate] HIVEMQ_HOST is not set in server/.env — nothing to connect to.");
  process.exit(1);
}

const client = mqtt.connect({
  host: process.env.HIVEMQ_HOST,
  port: Number(process.env.HIVEMQ_PORT) || 8883,
  protocol: process.env.MQTT_PROTOCOL || "mqtts",
  username: process.env.HIVEMQ_USERNAME || undefined,
  password: process.env.HIVEMQ_PASSWORD || undefined,
  clientId: `enoise-simulator-${Math.random().toString(16).slice(2, 8)}`
});

client.on("connect", () => {
  console.log(`[simulate] Connected. Publishing as ${nodeId}${doSpike ? " (will spike into critical)" : ""}. Ctrl+C to stop.`);
  client.publish(statusTopic(nodeId), JSON.stringify({ online: true }), { qos: 1, retain: true });

  let db = 42 + Math.random() * 5;
  let tick = 0;

  const interval = setInterval(() => {
    tick += 1;
    if (doSpike && tick > 5 && tick < 26) {
      db = Math.min(75, db + 3 + Math.random() * 2); // climb into critical and hold
    } else {
      db = Math.max(35, Math.min(55, db + (Math.random() - 0.5) * 4)); // gentle wander
    }

    const payload = {
      db_level: Math.round(db * 10) / 10,
      classification: db > 60 ? "Loud Conversation" : "Ambient Baseline",
      confidence: 0.7 + Math.random() * 0.25,
      timestamp: new Date().toISOString()
    };
    client.publish(telemetryTopic(nodeId), JSON.stringify(payload), { qos: 1 });
    console.log(`[simulate] ${nodeId} -> ${payload.db_level} dB (${payload.classification})`);
  }, 1000);

  // Say "offline" (like a real device's Last Will) and disconnect.
  const stop = () => {
    clearInterval(interval);
    client.publish(statusTopic(nodeId), JSON.stringify({ online: false }), { qos: 1, retain: true }, () => {
      client.end();
      process.exit(0);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  if (stopAfterSeconds > 0) setTimeout(stop, stopAfterSeconds * 1000);
});

client.on("error", err => {
  console.error("[simulate] Connection error:", err.message);
  process.exit(1);
});
