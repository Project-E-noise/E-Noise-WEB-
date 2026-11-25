// Per-node calibration (migration 018, docs/CALIBRATION.md) and the
// firmware version in each reading.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, query, resetDatabase, closeDatabase, createAdmin, createTable, bearer } from "./helpers.js";
import { ingestTelemetry, applyCalibration } from "../src/services/telemetryService.js";
import { parseTelemetry } from "../src/mqtt/topics.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

test("corrected = gain x raw + offset, kept within 0-200 dB", () => {
  assert.equal(applyCalibration(60, {}), 60);
  assert.equal(applyCalibration(60, { calibration_offset_db: "4.5", calibration_gain: "1" }), 64.5);
  assert.equal(applyCalibration(60, { calibration_offset_db: -9.41, calibration_gain: 1.1764 }), 61.17);
  assert.equal(applyCalibration(2, { calibration_offset_db: -10, calibration_gain: 1 }), 0);
});

test("new tables are uncalibrated; admins set offset and gain within limits", async () => {
  const created = await api().post("/api/tables").set(auth).send({ table_number: 20, sensor_node_id: "NODE-020" });
  assert.equal(created.body.table.calibration_offset_db, 0);
  assert.equal(created.body.table.calibration_gain, 1);
  const id = created.body.table.id;
  const ok = await api().put(`/api/tables/${id}`).set(auth).send({ calibration_offset_db: 4.5, calibration_gain: 1.02 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.table.calibration_offset_db, 4.5);
  assert.equal(ok.body.table.calibration_gain, 1.02);
  assert.equal((await api().put(`/api/tables/${id}`).set(auth).send({ calibration_offset_db: 50 })).status, 400);
  assert.equal((await api().put(`/api/tables/${id}`).set(auth).send({ calibration_gain: 3 })).status, 400);
  // Saving thresholds keeps the calibration.
  await api().put(`/api/thresholds/${id}`).set(auth).send({ warning_threshold: 66, critical_threshold: 74 });
  const after = await api().get(`/api/tables/${id}`).set(auth);
  assert.equal(after.body.table.calibration_offset_db, 4.5);
});

test("readings are stored and judged calibrated; the raw value and firmware are kept", async () => {
  const table = await createTable({ sensor_node_id: "NODE-CAL" });
  await query("UPDATE tables SET calibration_offset_db = 5, calibration_gain = 1 WHERE id = $1", [table.id]);
  await ingestTelemetry("NODE-CAL", { db_level: 60, fw: "1.1.0" });
  const { rows } = await query("SELECT current_db::float AS c, raw_db::float AS r, firmware_version FROM sensor_status WHERE table_id = $1", [table.id]);
  assert.deepEqual(rows[0], { c: 65, r: 60, firmware_version: "1.1.0" });
  const got = await api().get(`/api/tables/${table.id}`).set(auth);
  assert.equal(got.body.table.current_db, 65);
  assert.equal(got.body.table.sensor_status.raw_db, 60);
  assert.equal(got.body.table.sensor_status.firmware_version, "1.1.0");
});

test("firmware version in the payload: kept when sane, dropped otherwise", () => {
  assert.equal(parseTelemetry(Buffer.from('{"db_level":61.3,"fw":"1.1.0"}')).fw, "1.1.0");
  assert.equal(parseTelemetry(Buffer.from('{"db_level":61.3,"fw":"<script>"}')).fw, null);
  assert.equal(parseTelemetry(Buffer.from('{"db_level":61.3}')).fw, null);
});
