import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { createWsServer } from "./realtime/wsServer.js";
import { connectMqtt, disconnectMqtt } from "./mqtt/mqttClient.js";

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

// Render sends SIGTERM before stopping or redeploying the service. Close
// connections cleanly so MQTT and Postgres don't keep half-open sessions.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down...`);
  setTimeout(() => process.exit(0), 5000).unref();
  wss.clients.forEach(socket => socket.close(1001, "server restarting"));
  server.close();
  await disconnectMqtt();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
