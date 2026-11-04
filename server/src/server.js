import http from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { createWsServer } from "./realtime/wsServer.js";
import { connectMqtt } from "./mqtt/mqttClient.js";

// A plain http.Server wraps the Express app so the WebSocket server (Phase 6)
// can share the exact same port via an upgrade handler at /ws — no second
// port, no separate process, nothing extra to expose through a firewall or
// reverse proxy beyond what's already open for the REST API.
const server = http.createServer(app);
createWsServer(server);

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Project E-Noise API listening on http://localhost:${env.port}`);
  // eslint-disable-next-line no-console
  console.log(`[server] WebSocket real-time feed at ws://localhost:${env.port}/ws`);
  // eslint-disable-next-line no-console
  console.log(`[server] Allowing requests from ${env.corsOrigin}`);
});

// Starts (or skips, with a warning) MQTT ingestion from ESP32 nodes.
connectMqtt();
