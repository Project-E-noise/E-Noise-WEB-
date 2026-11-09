// WebSocket /ws: only admin tokens may connect; events are pushed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { WebSocket } from "ws";
import { app, resetDatabase, closeDatabase, createAdmin, createOccupant } from "./helpers.js";
import { createWsServer, broadcastTableUpdate } from "../src/realtime/wsServer.js";

let server, wss, url, admin, client;
before(async () => {
  await resetDatabase();
  admin = await createAdmin();
  client = await createOccupant({ email: "ws@test.local", password: "Password123" });
  server = http.createServer(app);
  wss = createWsServer(server);
  await new Promise(resolve => server.listen(0, resolve));
  url = `ws://127.0.0.1:${server.address().port}/ws`;
});
after(async () => {
  wss.close();
  await new Promise(resolve => server.close(resolve));
  await closeDatabase();
});

// Opens a socket and resolves with the first message or the close code.
function connect(token) {
  return new Promise(resolve => {
    const socket = new WebSocket(token ? `${url}?token=${encodeURIComponent(token)}` : url);
    socket.on("message", data => resolve({ socket, message: JSON.parse(data) }));
    socket.on("close", code => resolve({ socket, closeCode: code }));
  });
}

test("no token or a client token is closed with 4001", async () => {
  assert.equal((await connect(null)).closeCode, 4001);
  assert.equal((await connect("garbage")).closeCode, 4001);
  assert.equal((await connect(client.token)).closeCode, 4001);
});

test("admin token connects and receives table updates", async () => {
  const { socket, message } = await connect(admin.token);
  assert.deepEqual(message, { type: "connected" });
  const next = new Promise(resolve => socket.once("message", data => resolve(JSON.parse(data))));
  broadcastTableUpdate({ id: 1, current_db: 55 });
  assert.deepEqual(await next, { type: "table:update", table: { id: 1, current_db: 55 } });
  socket.close();
});
