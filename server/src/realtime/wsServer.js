import { WebSocketServer } from "ws";
import { verifyAdminToken } from "../utils/verifyAdminToken.js";

// Phase 6: push-based real-time delivery. Mounted on the same HTTP
// server/port as the REST API (path "/ws") — no separate port, so it works
// wherever the API is already reachable/proxied.
//
// Auth: browsers can't set an Authorization header on a WebSocket upgrade
// request, so the admin's JWT is passed as a query param instead
// (?token=...). It's verified with the exact same logic as REST requests
// (verifyAdminToken) before the connection is accepted.
//
// Protocol is intentionally tiny — one message shape in each direction:
//   server -> client: { type: "connected" }
//                      { type: "table:update", table: {...serialized table} }
//                      { type: "incident:created", incident: {...} }
//   client -> server: nothing required; the server replies to WebSocket
//                      ping frames automatically. No client->server message
//                      types are defined yet (the dashboard is read-only
//                      over this channel; writes still go through REST).

let wss = null;
const clients = new Set();

export function createWsServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (socket, request) => {
    const url = new URL(request.url, "http://internal");
    const token = url.searchParams.get("token");
    const result = await verifyAdminToken(token);

    if (!result.ok) {
      // 4001: app-defined close code for "auth failed" — distinct from the
      // generic 1008 so the frontend can tell "your session is stale, log
      // in again" apart from a transient network drop.
      socket.close(4001, "unauthorized");
      return;
    }

    clients.add(socket);
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));

    send(socket, { type: "connected" });
  });

  // Drop dead connections (e.g. a laptop that went to sleep) instead of
  // broadcasting into a socket that will never deliver.
  const heartbeat = setInterval(() => {
    for (const socket of clients) {
      if (socket.isAlive === false) {
        clients.delete(socket);
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}

function send(socket, payload) {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    /* a send failing means the socket is on its way out; the next
       heartbeat sweep or 'close'/'error' event will clean it up */
  }
}

function broadcast(payload) {
  for (const socket of clients) send(socket, payload);
}

export function broadcastTableUpdate(table) {
  broadcast({ type: "table:update", table });
}

export function broadcastIncidentCreated(incident) {
  broadcast({ type: "incident:created", incident });
}
