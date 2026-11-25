// Server pieces behind the dashboard changes: the live "monitoring" block
// on a table, the 60 s cache of 24 h stats, the system status endpoint,
// and CONFIRMED-only analytics.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, bearer, query } from "./helpers.js";
import { ingestTelemetry } from "../src/services/telemetryService.js";
import { appendStreakLabel } from "../src/models/sensorStatusModel.js";
import { serializeTable, clearStatsCache, STATS_CACHE_MS } from "../src/services/tablesService.js";
import { resetMlHealth } from "../src/services/mlClient.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
  resetMlHealth();
});
after(closeDatabase);

test("a loud table reports its streak progress", async () => {
  const table = await createTable({ sensor_node_id: "NODE-PROG", confirmation_seconds: 10 });
  const start = new Date(Date.now() - 6000);
  await ingestTelemetry("NODE-PROG", { db_level: 70 }, { now: start });
  await ingestTelemetry("NODE-PROG", { db_level: 70 }, { now: new Date(start.getTime() + 1000) });

  let t = (await api().get(`/api/tables/${table.id}`).set(auth)).body.table;
  assert.equal(t.is_monitoring, true);
  assert.equal(new Date(t.monitoring.since).getTime(), start.getTime());
  assert.equal(t.monitoring.required_seconds, 10);
  assert.equal(t.monitoring.label_count, 0);
  assert.equal(t.monitoring.waiting_for_label, false, "ML is down, so nothing to wait for");
  assert.equal(t.monitoring.decided, false);

  await appendStreakLabel(table.id, { category: "Mobile Phone Noise", confidence: 0.9, top_class: "Ringtone", at: new Date().toISOString() });
  t = (await api().get(`/api/tables/${table.id}`).set(auth)).body.table;
  assert.equal(t.monitoring.required_seconds, 4, "a phone label shortens the required time");
  assert.equal(t.monitoring.label_count, 1);

  await ingestTelemetry("NODE-PROG", { db_level: 40 });
  await ingestTelemetry("NODE-PROG", { db_level: 40 }, { now: new Date(Date.now() + 3000) });
  t = (await api().get(`/api/tables/${table.id}`).set(auth)).body.table;
  assert.equal(t.monitoring, null, "quiet again");
  assert.equal(t.is_monitoring, false);
});

test("24 h stats are cached per table for 60 s", async () => {
  const table = await createTable();
  await query("INSERT INTO noise_readings (table_id, db_level, recorded_at) VALUES ($1, 40, NOW())", [table.id]);
  clearStatsCache();
  assert.equal(STATS_CACHE_MS, 60000);
  const first = await serializeTable(table);
  assert.equal(first.avg_db, 40);
  await query("INSERT INTO noise_readings (table_id, db_level, recorded_at) VALUES ($1, 80, NOW())", [table.id]);
  const second = await serializeTable(table);
  assert.equal(second.avg_db, 40, "served from the cache");
  assert.equal(second.peak_db, 40);
  clearStatsCache();
  const third = await serializeTable(table);
  assert.equal(third.peak_db, 80, "fresh after the cache is cleared");
});

test("GET /api/system/status reports the ML service and the stale window", async () => {
  assert.equal((await api().get("/api/system/status")).status, 401);
  const res = await api().get("/api/system/status").set(auth);
  assert.equal(res.status, 200);
  assert.ok(["unknown", "offline", "online", "not_configured"].includes(res.body.ml_service), res.body.ml_service);
  assert.equal(typeof res.body.sensor_stale_seconds, "number");
  assert.equal(res.body.db_calibrated, false, "readings are estimates until calibrated");
});

test("analytics count CONFIRMED incidents only", async () => {
  const table = await createTable();
  const post = body => api().post("/api/incidents").set(auth).send({ table_id: table.id, db_level: 70, ...body });
  await post({ category: "Music", status: "CONFIRMED" });
  await post({ category: "Impact Noise", status: "IGNORED", filter_reason: "non_violation_category" });
  await post({ status: "UNVERIFIED", filter_reason: "no_classification" });
  await post({ category: "Music", status: "DISMISSED" });

  const overview = await api().get("/api/analytics/overview?range=today").set(auth);
  assert.equal(overview.body.total_incidents, 1);
  const breakdown = await api().get("/api/analytics/incidents?range=today").set(auth);
  assert.deepEqual(breakdown.body.category_counts, [0, 0, 1, 0, 0]);
  assert.equal(breakdown.body.day_counts.reduce((a, b) => a + b, 0), 1);
});

test("the client portal does not list filtered (IGNORED / UNVERIFIED) events", async () => {
  const { createOccupant, assign } = await import("./helpers.js");
  const table = await createTable();
  const o = await createOccupant({ email: "logs-filter@test.local", password: "Password123" });
  await assign(o.id, table.id);
  const post = body => api().post("/api/incidents").set(auth).send({ table_id: table.id, db_level: 70, ...body });
  await post({ category: "Music", status: "CONFIRMED" });
  await post({ status: "IGNORED", filter_reason: "non_violation_category" });
  await post({ status: "UNVERIFIED", filter_reason: "no_classification" });
  const logs = await api().get("/api/client/logs").set(bearer(o.token));
  const incidentRows = logs.body.items.filter(r => r.type === "incident");
  assert.equal(incidentRows.length, 1);
  assert.equal(incidentRows[0].status, "CONFIRMED");
  assert.equal(logs.body.total, 2, "one session + one violation");
});
