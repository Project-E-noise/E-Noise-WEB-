// Every admin route rejects missing/client tokens; every client route
// rejects admin tokens; clients only ever see their own data.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createOccupant, createTable, assign, bearer, query } from "./helpers.js";
import { signSession } from "../src/utils/tokens.js";
import jwt from "jsonwebtoken";

const ADMIN_ROUTES = [
  ["get", "/api/auth/me"], ["patch", "/api/auth/me"], ["post", "/api/auth/change-password"], ["post", "/api/auth/logout"],
  ["get", "/api/tables"], ["post", "/api/tables"], ["get", "/api/tables/1"], ["put", "/api/tables/1"], ["delete", "/api/tables/1"],
  ["get", "/api/tables/1/readings"], ["get", "/api/tables/1/incidents"],
  ["get", "/api/incidents"], ["post", "/api/incidents"], ["get", "/api/incidents/1"], ["put", "/api/incidents/1"], ["delete", "/api/incidents/1"],
  ["get", "/api/occupants"], ["post", "/api/occupants"], ["get", "/api/occupants/1"], ["put", "/api/occupants/1"], ["delete", "/api/occupants/1"],
  ["post", "/api/occupants/1/assign"], ["post", "/api/occupants/1/release"], ["get", "/api/occupants/1/violations"],
  ["get", "/api/thresholds"], ["put", "/api/thresholds/1"],
  ["get", "/api/analytics/overview"], ["get", "/api/analytics/incidents"], ["get", "/api/analytics/noise-trends"],
  ["get", "/api/export/readings"], ["get", "/api/export/incidents"], ["get", "/api/export/violations"], ["get", "/api/export/tables"]
];

const CLIENT_ROUTES = [
  ["get", "/api/client/profile"], ["patch", "/api/client/profile"], ["post", "/api/client/change-password"],
  ["get", "/api/client/logs"], ["get", "/api/client/violations"], ["post", "/api/client/logout"]
];

let admin, clientA, clientB;
before(async () => {
  await resetDatabase();
  admin = await createAdmin();
  clientA = await createOccupant({ email: "a@test.local", password: "Password123" });
  clientB = await createOccupant({ email: "b@test.local", password: "Password123" });
});
after(closeDatabase);

test("admin routes: no token -> 401, client token -> 403", async () => {
  for (const [method, path] of ADMIN_ROUTES) {
    const none = await api()[method](path);
    assert.equal(none.status, 401, `${method} ${path} without token`);
    assert.ok(none.body.error);
    const client = await api()[method](path).set(bearer(clientA.token));
    assert.equal(client.status, 403, `${method} ${path} with client token`);
  }
});

test("client routes: no token -> 401, admin token -> 403", async () => {
  for (const [method, path] of CLIENT_ROUTES) {
    assert.equal((await api()[method](path)).status, 401, `${method} ${path} without token`);
    assert.equal((await api()[method](path).set(bearer(admin.token))).status, 403, `${method} ${path} with admin token`);
  }
});

test("tokens signed with another secret, or another algorithm, are rejected", async () => {
  const forged = jwt.sign({ sub: admin.id, role: "admin" }, "some-other-secret");
  assert.equal((await api().get("/api/tables").set(bearer(forged))).status, 401);
  const none = jwt.sign({ sub: admin.id, role: "admin" }, "", { algorithm: "none" });
  assert.equal((await api().get("/api/tables").set(bearer(none))).status, 401);
  assert.equal((await api().get("/api/tables").set({ Authorization: "Token abc" })).status, 401);
});

test("an admin token for a deleted admin is rejected", async () => {
  const token = signSession(999999, "admin");
  assert.equal((await api().get("/api/tables").set(bearer(token))).status, 401);
});

test("clients only see their own logs and violations", async () => {
  const table = await createTable();
  await assign(clientB.id, table.id);
  // An incident for client B.
  const created = await api().post("/api/incidents").set(bearer(admin.token))
    .send({ table_id: table.id, category: "Impact Noise", db_level: 70 });
  assert.equal(created.status, 201);
  assert.equal(created.body.incident.occupant.id, clientB.id);

  const aLogs = await api().get("/api/client/logs").set(bearer(clientA.token));
  const aViolations = await api().get("/api/client/violations").set(bearer(clientA.token));
  assert.equal(aLogs.body.total, 0);
  assert.equal(aViolations.body.total, 0);

  const bLogs = await api().get("/api/client/logs").set(bearer(clientB.token));
  const bViolations = await api().get("/api/client/violations").set(bearer(clientB.token));
  assert.equal(bLogs.body.total, 2); // assignment + incident
  assert.equal(bViolations.body.total, 1);
  assert.equal(bViolations.body.current_violation_count, 1);

  // Query params can't be used to ask for someone else's data.
  const sneaky = await api().get(`/api/client/logs?occupant_id=${clientB.id}&id=${clientB.id}`).set(bearer(clientA.token));
  assert.equal(sneaky.body.total, 0);
});

test("inactive or unverified clients are rejected", async () => {
  const c = await createOccupant({ email: "c@test.local", password: "Password123" });
  await query("UPDATE occupants SET is_active = FALSE WHERE id = $1", [c.id]);
  assert.equal((await api().get("/api/client/profile").set(bearer(c.token))).status, 401);
  const d = await createOccupant({ email: "d@test.local", password: "Password123", verified: false });
  assert.equal((await api().get("/api/client/profile").set(bearer(d.token))).status, 403);
});
