import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { createWsServer } from "./realtime/wsServer.js";
import { connectMqtt, disconnectMqtt } from "./mqtt/mqttClient.js";
import { sweepStaleSensors } from "./services/telemetryService.js";
import { cleanupOldReadings, cleanupPersonalData } from "./services/retentionService.js";
import { checkMlHealth } from "./services/mlClient.js";

// The WebSocket server shares the same HTTP server and port as the REST
// API (at /ws), so only one port needs to be open.
const server = http.createServer(app);
const wss = createWsServer(server);

server.listen(env.port, () => {
  console.log(`[server] Project E-Noise API (${env.nodeEnv}) listening on port ${env.port}`);
  console.log(`[server] WebSocket at /ws. Allowed origins: ${env.corsOrigins.join(", ")}`);
  logOptionalFeatures();
});

// One line per optional feature that is off or misconfigured, so the Render
// log says right away why loud events are UNVERIFIED or emails don't arrive.
// (MQTT logs its own line in connectMqtt.)
function logOptionalFeatures() {
  if (!env.mlServiceUrl) {
    console.warn("[ml] ML_SERVICE_URL is not set: classification is off, so every sustained loud event is logged as UNVERIFIED (no strikes).");
  } else {
    console.log(`[ml] Classifier at ${new URL(env.mlServiceUrl).host}${env.mlApiKey ? " (with API key)" : " (no API key)"}.`);
  }
  const provider = env.email.provider || (env.smtp.host ? "smtp" : "");
  if (provider === "brevo" && !env.email.brevoApiKey) {
    console.warn("[email] EMAIL_PROVIDER=brevo but BREVO_API_KEY is empty: verification and set-password emails will FAIL. Set the key, or use `npm run admin:create` for the first admin.");
  } else if (!provider) {
    console.warn("[email] EMAIL_PROVIDER is not set: emails are not sent; verification links are printed in this log instead.");
  } else {
    console.log(`[email] Sending email with ${provider}.`);
  }
}

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

// Every 30 s, ping the ML service. The confirmation engine only waits for a
// label while it answers, and the dashboard shows an "ML offline" badge.
const ML_HEALTH_MS = 30000;
checkMlHealth();
const mlHealthTimer = setInterval(checkMlHealth, ML_HEALTH_MS);

// Once at startup, then every 24 h: delete violations older than
// VIOLATION_RETENTION_DAYS, remove the occupant from incidents that old, and
// delete seat history released that long ago. Errors only log a warning.
const VIOLATION_CLEANUP_MS = 24 * 60 * 60 * 1000;
async function runViolationCleanup() {
  try {
    const { violations, incidents, assignments } = await cleanupPersonalData();
    console.log(
      `[retention] Older than ${env.violationRetentionDays} days: deleted ${violations} violation(s), ` +
        `unlinked ${incidents} incident(s) from occupants, deleted ${assignments} released seat record(s).`
    );
  } catch (err) {
    console.warn(`[retention] Personal data cleanup failed: ${err.message || err.code || "database unreachable"}`);
  }
}
runViolationCleanup();
const violationCleanupTimer = setInterval(runViolationCleanup, VIOLATION_CLEANUP_MS);

// Once at startup, then every hour: delete raw noise readings older than
// NOISE_READINGS_RETENTION_DAYS (in batches). Errors only log a warning.
const READINGS_CLEANUP_MS = 60 * 60 * 1000;
async function runReadingsCleanup() {
  try {
    const deleted = await cleanupOldReadings();
    console.log(`[retention] Deleted ${deleted} noise reading(s) older than ${env.noiseReadingsRetentionDays} days.`);
  } catch (err) {
    console.warn(`[retention] Noise readings cleanup failed: ${err.message || err.code || "database unreachable"}`);
  }
}
runReadingsCleanup();
const readingsCleanupTimer = setInterval(runReadingsCleanup, READINGS_CLEANUP_MS);

// Render sends SIGTERM before stopping or redeploying the service. Close
// connections cleanly so MQTT and Postgres don't keep half-open sessions.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down...`);
  setTimeout(() => process.exit(0), 5000).unref();
  clearInterval(sensorSweepTimer);
  clearInterval(mlHealthTimer);
  clearInterval(violationCleanupTimer);
  clearInterval(readingsCleanupTimer);
  wss.clients.forEach(socket => socket.close(1001, "server restarting"));
  server.close();
  await disconnectMqtt();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
