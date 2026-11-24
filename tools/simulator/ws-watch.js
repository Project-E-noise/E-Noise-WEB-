// Test WebSocket client: signs in as an admin and prints every live event
// the dashboard would receive (table:update, incident:created).
//
// Usage: node ws-watch.js [--api http://localhost:5000]
// Credentials come from the environment, never from this file:
//   ENOISE_ADMIN_EMAIL, ENOISE_ADMIN_PASSWORD
// (for a local database filled by `npm run db:seed`, the demo admin in README.md)
import { pathToFileURL } from "node:url";
import WebSocket from "ws";

export async function adminLogin(api, email, password) {
  const res = await fetch(`${api}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Admin login failed (${res.status}): ${body.error || "no message"}`);
  return body.token;
}

/** Same URL rule as capstone/src/services/apiClient.js getWsUrl(): http->ws, https->wss. */
export function wsUrlFor(api, token) {
  return `${api.replace(/\/+$/, "").replace(/^http/i, "ws")}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Connects and keeps reconnecting (like the dashboard). Every message is
 * stored in `messages` with the time it arrived. Returns { messages, close }.
 */
export function watch(api, token, { onMessage, onState, reconnectMs = 1000 } = {}) {
  const messages = [];
  let socket;
  let closed = false;
  const connect = () => {
    socket = new WebSocket(wsUrlFor(api, token));
    socket.on("open", () => onState?.("open"));
    socket.on("message", raw => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const entry = { at: Date.now(), ...msg };
      messages.push(entry);
      onMessage?.(entry);
    });
    socket.on("close", code => {
      onState?.(`closed ${code}`);
      if (!closed && code !== 4001) setTimeout(connect, reconnectMs);
    });
    socket.on("error", () => {});
  };
  connect();
  return {
    messages,
    close() {
      closed = true;
      socket?.close();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--api");
  const api = (i === -1 ? process.env.ENOISE_API_URL || "http://localhost:5000" : process.argv[i + 1]).replace(/\/+$/, "");
  const email = process.env.ENOISE_ADMIN_EMAIL;
  const password = process.env.ENOISE_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ENOISE_ADMIN_EMAIL and ENOISE_ADMIN_PASSWORD first.");
    process.exit(1);
  }
  const token = await adminLogin(api, email, password);
  watch(api, token, {
    onState: s => console.log(`[ws] ${s}`),
    onMessage: m => {
      if (m.type === "table:update") {
        const t = m.table;
        const led = t.led_state;
        console.log(
          `[ws] table:update  T${t.table_number} ${t.sensor_node_id} ${t.is_online ? "online " : "OFFLINE"} ${String(t.current_db ?? "-").padStart(5)} dB ` +
            `${t.status.padEnd(8)} LED ${led.green}g ${led.yellow}y ${led.red}r ${led.critical ? "CRITICAL" : ""}${t.is_monitoring ? " (timing loud streak)" : ""}`
        );
      } else if (m.type === "incident:created") {
        const inc = m.incident;
        console.log(`[ws] incident:created  #${inc.id} table ${inc.table?.table_number} ${inc.status} ${inc.category ?? "-"} ${inc.filter_reason ?? ""} bulb=${inc.bulb_triggered}`);
      } else console.log(`[ws] ${m.type}`);
    }
  });
}
