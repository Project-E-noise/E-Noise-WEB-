// MQTT payload parsing and the critical confirmation rule (no broker needed:
// the service functions are called directly, MQTT publishing is a no-op).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, closeDatabase, createTable, createOccupant, assign, query } from "./helpers.js";
import { parseTelemetry, parseStatus, nodeIdFromTopic, isLikelyWav } from "../src/mqtt/topics.js";
import { ingestTelemetry, ingestStatus } from "../src/services/telemetryService.js";
import { computeLedCounts } from "../src/utils/ledLogic.js";

before(resetDatabase);
after(closeDatabase);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const status = async tableId => (await query("SELECT * FROM sensor_status WHERE table_id = $1", [tableId])).rows[0];
const incidents = async tableId => (await query("SELECT * FROM incidents WHERE table_id = $1", [tableId])).rows;

test("parseTelemetry accepts good payloads and rejects bad ones", () => {
  assert.deepEqual(parseTelemetry(Buffer.from('{"db_level":62.4}')), { db_level: 62.4, classification: null, confidence: null, timestamp: null });
  assert.ok(parseTelemetry(Buffer.from("not json")).error);
  assert.ok(parseTelemetry(Buffer.from("null")).error);
  assert.ok(parseTelemetry(Buffer.from('{"db_level":"loud"}')).error);
  assert.ok(parseTelemetry(Buffer.from('{"db_level":999}')).error);
  const odd = parseTelemetry(Buffer.from('{"db_level":50,"classification":"Shouting","confidence":5,"timestamp":"1999-01-01T00:00:00Z"}'));
  assert.equal(odd.classification, null, "unknown categories are dropped");
  assert.equal(odd.confidence, null, "out-of-range confidence is dropped");
  assert.equal(odd.timestamp, null, "clearly wrong device clocks are ignored");
  assert.deepEqual(parseStatus(Buffer.from('{"online":true}')), { online: true });
  assert.ok(parseStatus(Buffer.from("")).error);
  assert.equal(nodeIdFromTopic("enoise/NODE-001/telemetry"), "NODE-001");
  assert.equal(nodeIdFromTopic("other/NODE-001/telemetry"), null);
  assert.equal(isLikelyWav(Buffer.from("hello")), false);
});

test("LED counts follow the thresholds", () => {
  const t = { warning_threshold: 50, critical_threshold: 60 };
  assert.deepEqual(computeLedCounts(25, t), { green: 3, yellow: 0, red: 0 });
  assert.deepEqual(computeLedCounts(50, t), { green: 5, yellow: 1, red: 0 });
  assert.deepEqual(computeLedCounts(59.9, t), { green: 5, yellow: 3, red: 0 });
  assert.deepEqual(computeLedCounts(60, t), { green: 5, yellow: 3, red: 2 });
});

test("critical is only confirmed after confirmation_seconds of sustained noise", async () => {
  const table = await createTable({ sensor_node_id: "NODE-CONF", confirmation_seconds: 1 });
  const o = await createOccupant();
  await assign(o.id, table.id);

  await ingestTelemetry("NODE-CONF", { db_level: 65 });
  let s = await status(table.id);
  assert.ok(s.monitoring_since, "streak started");
  assert.equal(s.led_critical, false, "not confirmed on the first loud reading");
  assert.equal((await incidents(table.id)).length, 0);

  await sleep(600);
  await ingestTelemetry("NODE-CONF", { db_level: 66 });
  assert.equal((await incidents(table.id)).length, 0, "still inside the window");

  await sleep(600);
  await ingestTelemetry("NODE-CONF", { db_level: 67 });
  s = await status(table.id);
  assert.equal(s.led_critical, true);
  const rows = await incidents(table.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "CONFIRMED");
  assert.equal(rows[0].occupant_id, o.id);
  assert.equal(rows[0].category, "Loud Conversation", "fallback category when ML gave no label");
  assert.equal((await query("SELECT * FROM violations WHERE incident_id = $1", [rows[0].id])).rows.length, 1);

  await ingestTelemetry("NODE-CONF", { db_level: 68 });
  assert.equal((await incidents(table.id)).length, 1, "same streak doesn't create a second incident");

  await ingestTelemetry("NODE-CONF", { db_level: 40 });
  s = await status(table.id);
  assert.equal(s.led_critical, false);
  assert.equal(s.monitoring_since, null);
});

test("a short spike is dismissed with no incident", async () => {
  const table = await createTable({ sensor_node_id: "NODE-SPIKE", confirmation_seconds: 10 });
  await ingestTelemetry("NODE-SPIKE", { db_level: 70 });
  await ingestTelemetry("NODE-SPIKE", { db_level: 45 });
  assert.equal((await status(table.id)).monitoring_since, null);
  assert.equal((await incidents(table.id)).length, 0);
});

test("a gap in readings restarts the streak (no instant incident after reconnect)", async () => {
  const table = await createTable({ sensor_node_id: "NODE-GAP", confirmation_seconds: 10 });
  await ingestTelemetry("NODE-GAP", { db_level: 70 });
  // Pretend the node went quiet for an hour in the middle of the streak.
  await query("UPDATE sensor_status SET monitoring_since = NOW() - INTERVAL '1 hour', last_seen = NOW() - INTERVAL '1 hour' WHERE table_id = $1", [table.id]);
  await ingestTelemetry("NODE-GAP", { db_level: 70 });
  assert.equal((await incidents(table.id)).length, 0);
  const s = await status(table.id);
  assert.ok(Date.now() - new Date(s.monitoring_since).getTime() < 5000, "streak restarted from now");
});

test("offline status cancels an unconfirmed streak; ML label is kept until the table is quiet", async () => {
  const table = await createTable({ sensor_node_id: "NODE-OFF" });
  await ingestTelemetry("NODE-OFF", { db_level: 70 });
  await ingestStatus("NODE-OFF", { online: false });
  let s = await status(table.id);
  assert.equal(s.is_online, false);
  assert.equal(s.monitoring_since, null);

  await query("UPDATE sensor_status SET classification = 'Impact Noise', confidence = 0.9 WHERE table_id = $1", [table.id]);
  await ingestTelemetry("NODE-OFF", { db_level: 55 });
  s = await status(table.id);
  assert.equal(s.classification, "Impact Noise", "a reading without a label keeps the ML label");
  assert.equal(s.is_online, true);
  await ingestTelemetry("NODE-OFF", { db_level: 40 });
  assert.equal((await status(table.id)).classification, null, "cleared once the table is quiet");
});

test("unknown nodes are ignored", async () => {
  await ingestTelemetry("NODE-UNKNOWN", { db_level: 70 });
  await ingestStatus("NODE-UNKNOWN", { online: true });
});
