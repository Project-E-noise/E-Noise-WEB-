// Migration 014: the Music category, the IGNORED / UNVERIFIED incident
// statuses, a nullable category (required only for CONFIRMED), and the
// columns the violation-gating engine keeps its state in.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, closeDatabase, createTable, query } from "./helpers.js";

before(resetDatabase);
after(closeDatabase);

const rejects = (promise, pattern) => assert.rejects(promise, err => pattern.test(err.message));

test("Music is accepted by every category CHECK", async () => {
  const table = await createTable();
  await query("INSERT INTO incidents (table_id, category, db_level, status, occurred_at) VALUES ($1, 'Music', 65, 'CONFIRMED', NOW())", [table.id]);
  await query("INSERT INTO noise_readings (table_id, db_level, classification, recorded_at) VALUES ($1, 65, 'Music', NOW())", [table.id]);
  await query("UPDATE sensor_status SET classification = 'Music' WHERE table_id = $1", [table.id]);
  await rejects(query("UPDATE sensor_status SET classification = 'Shouting' WHERE table_id = $1", [table.id]), /sensor_status_classification_check/);
});

test("incident statuses include IGNORED and UNVERIFIED; category is required only for CONFIRMED", async () => {
  const table = await createTable();
  const insert = (status, category, extra = "") =>
    query(`INSERT INTO incidents (table_id, category, db_level, status, occurred_at ${extra ? "," + extra : ""}) VALUES ($1, $2, 65, $3, NOW() ${extra ? ", 'non_violation_category'" : ""})`, [table.id, category, status]);

  await insert("IGNORED", null);
  await insert("UNVERIFIED", null);
  await insert("IGNORED", "Impact Noise");
  await rejects(insert("CONFIRMED", null), /incidents_category_required_when_confirmed/);
  await rejects(insert("MAYBE", null), /incidents_status_check/);
});

test("filter_reason only accepts the known reasons", async () => {
  const table = await createTable();
  await query("INSERT INTO incidents (table_id, category, db_level, status, occurred_at, filter_reason) VALUES ($1, NULL, 65, 'UNVERIFIED', NOW(), 'low_confidence')", [table.id]);
  await rejects(
    query("INSERT INTO incidents (table_id, category, db_level, status, occurred_at, filter_reason) VALUES ($1, NULL, 65, 'UNVERIFIED', NOW(), 'because')", [table.id]),
    /incidents_filter_reason_check/
  );
});

test("new columns exist with the expected types", async () => {
  const columns = async tableName =>
    Object.fromEntries((await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1", [tableName])).rows.map(r => [r.column_name, r.data_type]));
  const incidents = await columns("incidents");
  assert.equal(incidents.top_class, "character varying");
  assert.equal(incidents.peak_db, "numeric");
  assert.equal(incidents.filter_reason, "character varying");
  const sensor = await columns("sensor_status");
  assert.equal(sensor.last_loud_at, "timestamp with time zone");
  assert.equal(sensor.cooldown_until, "timestamp with time zone");
  assert.equal(sensor.streak_labels, "jsonb");
  assert.equal(sensor.peak_db, "numeric");
  const { rows } = await query("SELECT column_default FROM information_schema.columns WHERE table_name = 'sensor_status' AND column_name = 'streak_labels'");
  assert.match(rows[0].column_default, /'\[\]'::jsonb/);
});

test("the API accepts Music and the new statuses", async () => {
  const { api, createAdmin, bearer } = await import("./helpers.js");
  const auth = bearer((await createAdmin()).token);
  const table = await createTable();
  const music = await api().post("/api/incidents").set(auth).send({ table_id: table.id, category: "Music", db_level: 66 });
  assert.equal(music.status, 201, music.body.error);
  const ignored = await api().post("/api/incidents").set(auth).send({ table_id: table.id, category: "Impact Noise", db_level: 66, status: "IGNORED" });
  assert.equal(ignored.status, 201, ignored.body.error);
  const unverified = await api().post("/api/incidents").set(auth).send({ table_id: table.id, category: "Impact Noise", db_level: 66, status: "UNVERIFIED" });
  assert.equal(unverified.status, 201, unverified.body.error);
});
