// Analytics endpoints and CSV/JSON exports (filters + CSV injection guard).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, createOccupant, assign, bearer, query } from "./helpers.js";
import { escapeCell } from "../src/utils/csv.js";

let auth, tableA, tableB;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
  tableA = await createTable();
  tableB = await createTable();
  const o = await createOccupant();
  await assign(o.id, tableA.id);
  const now = Date.now();
  for (let i = 0; i < 10; i += 1) {
    await query("INSERT INTO noise_readings (table_id, db_level, recorded_at) VALUES ($1, $2, $3), ($4, $5, $3)",
      [tableA.id, 40 + i, new Date(now - i * 600000), tableB.id, 50]);
  }
  await query("INSERT INTO noise_readings (table_id, db_level, recorded_at) VALUES ($1, 45, NOW() - INTERVAL '20 days')", [tableA.id]);
  await api().post("/api/incidents").set(auth).send({ table_id: tableA.id, category: "Impact Noise", db_level: 70, notes: "=SUM(A1:A9)" });
  await api().post("/api/incidents").set(auth).send({ table_id: tableA.id, category: "Loud Conversation", db_level: 65 });
  await api().post("/api/incidents").set(auth).send({ table_id: tableB.id, category: "Loud Conversation", db_level: 62, occurred_at: new Date(now - 10 * 86400000).toISOString() });
});
after(closeDatabase);

test("overview, incident breakdown and noise trends", async () => {
  const overview = await api().get("/api/analytics/overview?range=7d&tz=Asia/Manila").set(auth);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.total_incidents, 2);
  assert.equal(overview.body.most_affected_table, `Table ${tableA.table_number}`);
  assert.ok(overview.body.avg_daily_db > 40);

  const all = await api().get("/api/analytics/overview?range=30d").set(auth);
  assert.equal(all.body.total_incidents, 3);

  const breakdown = await api().get("/api/analytics/incidents?range=7d").set(auth);
  assert.deepEqual(breakdown.body.category_counts, [1, 0, 1, 0]);
  assert.equal(breakdown.body.day_counts.reduce((a, b) => a + b, 0), 2);

  const trends = await api().get("/api/analytics/noise-trends?range=today").set(auth);
  assert.equal(trends.body.bucket, "hour");
  assert.equal(trends.body.series.length, 2);
  assert.equal(trends.body.series[0].values.length, trends.body.labels.length);

  const monthly = await api().get("/api/analytics/noise-trends?range=30d").set(auth);
  assert.equal(monthly.body.bucket, "day");

  const custom = new URLSearchParams({ from: new Date(Date.now() - 86400000).toISOString(), to: new Date().toISOString() });
  assert.equal((await api().get(`/api/analytics/overview?${custom}`).set(auth)).status, 200);
});

test("analytics reject bad ranges and timezones", async () => {
  assert.equal((await api().get("/api/analytics/overview?range=1y").set(auth)).status, 400);
  assert.equal((await api().get("/api/analytics/overview?tz=Not/AZone").set(auth)).status, 400);
  assert.equal((await api().get("/api/analytics/overview?tz=';DROP TABLE x;--").set(auth)).status, 400);
  assert.equal((await api().get("/api/analytics/overview?from=2026-05-02&to=2026-05-01").set(auth)).status, 400);
});

test("CSV export with filters, and formula cells are made safe", async () => {
  const res = await api().get(`/api/export/incidents?table_id=${tableA.id}`).set(auth);
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  assert.match(res.headers["content-disposition"], /incidents\.csv/);
  const lines = res.text.trim().split("\r\n");
  assert.equal(lines.length, 3, "header + 2 incidents for table A");
  assert.ok(res.text.includes("'=SUM(A1:A9)"), "formula is escaped with a leading quote");

  const readings = await api().get(`/api/export/readings?range=7d&table_id=${tableB.id}`).set(auth);
  assert.equal(readings.text.trim().split("\r\n").length, 11);

  const tables = await api().get("/api/export/tables").set(auth);
  assert.equal(tables.text.trim().split("\r\n").length, 3);
  const violations = await api().get("/api/export/violations").set(auth);
  assert.equal(violations.text.trim().split("\r\n").length, 3);
});

test("JSON export and format validation", async () => {
  const res = await api().get("/api/export/readings?format=json&range=all").set(auth);
  assert.match(res.headers["content-type"], /application\/json/);
  const rows = JSON.parse(res.text);
  assert.equal(rows.length, 21);
  assert.equal(typeof rows[0].db_level, "number");
  assert.equal((await api().get("/api/export/readings?format=xlsx").set(auth)).status, 400);
  assert.equal((await api().get("/api/export/readings?table_id=abc").set(auth)).status, 400);
});

test("escapeCell", () => {
  assert.equal(escapeCell("=1+1"), "'=1+1");
  assert.equal(escapeCell("+cmd"), "'+cmd");
  assert.equal(escapeCell("-2+3"), "'-2+3");
  assert.equal(escapeCell("@SUM(1)"), "'@SUM(1)");
  assert.equal(escapeCell(-3.5), "-3.5", "real negative numbers are untouched");
  assert.equal(escapeCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(escapeCell(null), "");
});
