// Tables CRUD, threshold validation (warning < critical), readings.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, bearer, query } from "./helpers.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

test("create, read, update, delete a table", async () => {
  const created = await api().post("/api/tables").set(auth).send({ table_number: 8, sensor_node_id: "NODE-008", description: "Window" });
  assert.equal(created.status, 201);
  const t = created.body.table;
  assert.equal(t.warning_threshold, 50);
  assert.equal(t.critical_threshold, 60);
  assert.equal(t.configured_status, "AVAILABLE");
  assert.deepEqual(t.led_state, { green: 0, yellow: 0, red: 0, critical: false });

  const list = await api().get("/api/tables").set(auth);
  assert.equal(list.body.tables.length, 1);

  const got = await api().get(`/api/tables/${t.id}`).set(auth);
  assert.equal(got.body.table.sensor_node_id, "NODE-008");

  const updated = await api().put(`/api/tables/${t.id}`).set(auth).send({ description: "Corner", status: "PAUSED" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.table.description, "Corner");
  assert.equal(updated.body.table.configured_status, "PAUSED");
  assert.equal(updated.body.table.table_number, 8, "fields not sent are kept");

  assert.equal((await api().delete(`/api/tables/${t.id}`).set(auth)).status, 204);
  assert.equal((await api().get(`/api/tables/${t.id}`).set(auth)).status, 404);
  assert.equal((await api().delete(`/api/tables/${t.id}`).set(auth)).status, 404);
});

test("table validation errors", async () => {
  const bad = [
    [{ sensor_node_id: "NODE-X" }, /Table number is required/],
    [{ table_number: "abc", sensor_node_id: "N1" }, /must be a number/],
    [{ table_number: 0, sensor_node_id: "N1" }, /between 1 and 9999/],
    [{ table_number: 1.5, sensor_node_id: "N1" }, /whole number/],
    [{ table_number: 1 }, /Sensor node ID is required/],
    [{ table_number: 1, sensor_node_id: "enoise/#" }, /letters, numbers/],
    [{ table_number: 1, sensor_node_id: "N1", status: "BROKEN" }, /Status must be one of/],
    [{ table_number: 1, sensor_node_id: "N1", warning_threshold: 60, critical_threshold: 60 }, /less than the critical/],
    [{ table_number: 1, sensor_node_id: "N1", warning_threshold: -1 }, /between 0 and 150/],
    [{ table_number: 1, sensor_node_id: "N1", confirmation_seconds: -1 }, /between 0 and 3600/],
    [{ table_number: 1, sensor_node_id: "N1", description: "x".repeat(501) }, /500 characters/]
  ];
  for (const [body, message] of bad) {
    const res = await api().post("/api/tables").set(auth).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error, message);
  }
});

test("duplicate table numbers and node ids are rejected with 409", async () => {
  await createTable({ table_number: 20, sensor_node_id: "NODE-020" });
  const sameNumber = await api().post("/api/tables").set(auth).send({ table_number: 20, sensor_node_id: "NODE-999" });
  assert.equal(sameNumber.status, 409);
  assert.match(sameNumber.body.error, /table number/);
  const sameNode = await api().post("/api/tables").set(auth).send({ table_number: 21, sensor_node_id: "node-020" });
  assert.equal(sameNode.status, 409);
  assert.match(sameNode.body.error, /sensor node ID/);
});

test("thresholds: list and update with warning < critical", async () => {
  const table = await createTable();
  const list = await api().get("/api/thresholds").set(auth);
  assert.ok(list.body.thresholds.some(t => t.table_id === table.id));

  const ok = await api().put(`/api/thresholds/${table.id}`).set(auth).send({ warning_threshold: 45, critical_threshold: 55, confirmation_seconds: 15 });
  assert.equal(ok.status, 200);
  assert.deepEqual(
    { w: ok.body.threshold.warning_threshold, c: ok.body.threshold.critical_threshold, s: ok.body.threshold.confirmation_seconds },
    { w: 45, c: 55, s: 15 }
  );

  // Only sending warning: compared against the saved critical (55).
  const tooHigh = await api().put(`/api/thresholds/${table.id}`).set(auth).send({ warning_threshold: 56 });
  assert.equal(tooHigh.status, 400);
  assert.match(tooHigh.body.error, /less than the critical/);
  assert.equal((await api().put(`/api/thresholds/${table.id}`).set(auth).send({ confirmation_seconds: 2.5 })).status, 400);
  assert.equal((await api().put(`/api/thresholds/${table.id}`).set(auth).send({ status: "nope" })).status, 400);
  assert.equal((await api().put("/api/thresholds/999999").set(auth).send({})).status, 404);
});

test("readings: raw, grouped per minute, and date filters", async () => {
  const table = await createTable();
  const base = Date.now() - 60 * 60 * 1000;
  for (let i = 0; i < 6; i += 1) {
    await query("INSERT INTO noise_readings (table_id, db_level, recorded_at) VALUES ($1, $2, $3)", [table.id, 40 + i, new Date(base + i * 20000)]);
  }
  const raw = await api().get(`/api/tables/${table.id}/readings`).set(auth);
  assert.equal(raw.body.readings.length, 6);
  assert.equal(raw.body.readings[0].db_level, 40);

  const grouped = await api().get(`/api/tables/${table.id}/readings?group=minute`).set(auth);
  assert.ok(grouped.body.readings.length >= 2 && grouped.body.readings.length <= 3);
  assert.ok(grouped.body.readings.every(r => r.samples >= 1));

  const future = await api().get(`/api/tables/${table.id}/readings?from=${new Date(Date.now() + 60000).toISOString()}`).set(auth);
  assert.equal(future.body.readings.length, 0);

  assert.equal((await api().get(`/api/tables/${table.id}/readings?group=week`).set(auth)).status, 400);
  assert.equal((await api().get(`/api/tables/${table.id}/readings?range=forever`).set(auth)).status, 400);

  const incidents = await api().get(`/api/tables/${table.id}/incidents`).set(auth);
  assert.deepEqual(incidents.body.incidents, []);
});
