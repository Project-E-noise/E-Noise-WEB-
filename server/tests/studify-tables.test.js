// Migration 017 (node ID format in the database) and `npm run db:seed:tables`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, query, resetDatabase, closeDatabase } from "./helpers.js";
import { seedTables } from "../db/seed-tables.js";

before(resetDatabase);
after(closeDatabase);

test("migrations alone create no tables", async () => {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM tables");
  assert.equal(rows[0].n, 0);
});

test("the database rejects node IDs that would break MQTT topics", async () => {
  await assert.rejects(
    query("INSERT INTO tables (table_number, sensor_node_id) VALUES (90, 'enoise/#')"),
    err => err.code === "23514" && /tables_sensor_node_id_format/.test(err.constraint)
  );
  await query("INSERT INTO tables (table_number, sensor_node_id) VALUES (91, 'NODE_91-a')");
  await query("DELETE FROM tables WHERE table_number = 91");
});

test("db:seed:tables creates the 7 Studify tables once, and keeps existing ones", async () => {
  // An existing table 3 with its own node ID and thresholds must stay as it is.
  await query("INSERT INTO tables (table_number, sensor_node_id, warning_threshold, critical_threshold) VALUES (3, 'NODE-CUSTOM', 55, 65)");

  const client = await pool.connect();
  try {
    const first = await seedTables(client, { log: () => {} });
    const second = await seedTables(client, { log: () => {} });
    assert.equal(first, 6);
    assert.equal(second, 0);
  } finally {
    client.release();
  }

  const { rows } = await query(
    `SELECT t.table_number, t.sensor_node_id, t.warning_threshold::float AS w, t.critical_threshold::float AS c, t.status,
            (SELECT COUNT(*)::int FROM sensor_status s WHERE s.table_id = t.id) AS status_rows
     FROM tables t ORDER BY t.table_number`
  );
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[2], { table_number: 3, sensor_node_id: "NODE-CUSTOM", w: 55, c: 65, status: "AVAILABLE", status_rows: 0 });
  for (const r of rows.filter(r => r.table_number !== 3)) {
    assert.equal(r.sensor_node_id, `NODE-00${r.table_number}`);
    assert.equal(r.w, 68);
    assert.equal(r.c, 75);
    assert.equal(r.status, r.table_number === 7 ? "PAUSED" : "AVAILABLE");
    assert.equal(r.status_rows, 1);
  }
  const people = await query("SELECT (SELECT COUNT(*) FROM occupants)::int AS o, (SELECT COUNT(*) FROM admins)::int AS a, (SELECT COUNT(*) FROM noise_readings)::int AS r");
  assert.deepEqual(people.rows[0], { o: 0, a: 0, r: 0 });
});
