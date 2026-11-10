import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { createWsServer } from "./realtime/wsServer.js";
import { connectMqtt, disconnectMqtt } from "./mqtt/mqttClient.js";
import { sweepStaleSensors } from "./services/telemetryService.js";

// The WebSocket server shares the same HTTP server and port as the REST
// API (at /ws), so only one port needs to be open.
const server = http.createServer(app);
const wss = createWsServer(server);

server.listen(env.port, () => {
  console.log(`[server] Project E-Noise API (${env.nodeEnv}) listening on port ${env.port}`);
  console.log(`[server] WebSocket at /ws. Allowed origins: ${env.corsOrigins.join(", ")}`);
});

// Starts MQTT ingestion from the sensor nodes (or skips it with a warning).
connectMqtt();

// Every 15 s, mark sensors that went silent as offline. A database outage
// only logs a warning; the next run tries again.
const SENSOR_SWEEP_MS = 15000;
async function runSensorSweep() {
  try {
    const changed = await sweepStaleSensors();
    if (changed.length) console.log(`[sensors] Marked ${changed.length} silent sensor(s) offline.`);
  } catch (err) {
    console.warn(`[sensors] Offline sweep failed: ${err.message || err.code || "database unreachable"}`);
  }
}
runSensorSweep();
const sensorSweepTimer = setInterval(runSensorSweep, SENSOR_SWEEP_MS);

// Render sends SIGTERM before stopping or redeploying the service. Close
// connections cleanly so MQTT and Postgres don't keep half-open sessions.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down...`);
  setTimeout(() => process.exit(0), 5000).unref();
  clearInterval(sensorSweepTimer);
  wss.clients.forEach(socket => socket.close(1001, "server restarting"));
  server.close();
  await disconnectMqtt();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
