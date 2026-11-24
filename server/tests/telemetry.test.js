// MQTT payload parsing and the violation-gating confirmation engine (no
// broker needed: the service functions are called directly and MQTT
// publishing is a no-op). Time is passed in explicitly ({ now }), so the
// tests simulate seconds without sleeping.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, closeDatabase, createTable, createOccupant, query } from "./helpers.js";
import { startFakeMl, fakeWav } from "./fake-ml.js";
import { parseTelemetry, parseStatus, nodeIdFromTopic, isLikelyWav } from "../src/mqtt/topics.js";
import { ingestTelemetry, ingestStatus, ingestAudioClip } from "../src/services/telemetryService.js";
import { appendStreakLabel } from "../src/models/sensorStatusModel.js";
import { computeLedCounts } from "../src/utils/ledLogic.js";
import { env } from "../src/config/env.js";
import { checkMlHealth, resetMlHealth } from "../src/services/mlClient.js";

let fakeMl;
const DEAD_ML = "http://127.0.0.1:9";
before(async () => {
  await resetDatabase();
  fakeMl = await startFakeMl();
});
after(async () => {
  await fakeMl.close();
  await closeDatabase();
});
// Default: ML service down, so the engine never waits for a label.
beforeEach(() => {
  env.mlServiceUrl = DEAD_ML;
  resetMlHealth();
});

const T0 = Date.now() - 60 * 60 * 1000; // an hour ago, so simulated time never runs into the future
const at = seconds => new Date(T0 + seconds * 1000);
let nodeCounter = 0;

async function setup({ confirmation_seconds = 10, occupant = true, status } = {}) {
  const node = `NODE-E${++nodeCounter}`;
  const table = await createTable({ sensor_node_id: node, confirmation_seconds });
  if (status) await query("UPDATE tables SET status = $2 WHERE id = $1", [table.id, status]);
  let o = null;
  if (occupant) {
    o = await createOccupant();
    await query("INSERT INTO table_assignments (table_id, occupant_id, assigned_at) VALUES ($1, $2, $3)", [table.id, o.id, at(-3600)]);
  }
  // reading(seconds, db): one telemetry message at simulated time T0 + seconds.
  const reading = (seconds, db) => ingestTelemetry(node, { db_level: db }, { now: at(seconds) });
  const label = (seconds, category, confidence = 0.9, top_class = null) =>
    appendStreakLabel(table.id, { category, confidence, top_class, at: at(seconds).toISOString() });
  return { node, table, occupant: o, reading, label };
}

const status = async tableId => (await query("SELECT * FROM sensor_status WHERE table_id = $1", [tableId])).rows[0];
const incidents = async tableId => (await query("SELECT * FROM incidents WHERE table_id = $1 ORDER BY id", [tableId])).rows;
const violations = async tableId => (await query("SELECT * FROM violations WHERE table_id = $1", [tableId])).rows;

// Loud readings every second from `from` to `to` (inclusive).
async function loud(reading, from, to, db = 70) {
  for (let s = from; s <= to; s++) await reading(s, db);
}

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
  assert.equal(parseTelemetry(Buffer.from('{"db_level":50,"classification":"Music"}')).classification, "Music");
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

test("a violation label + sustained time -> CONFIRMED, critical bulb, strike, peak stored", async () => {
  const { table, occupant, reading, label } = await setup();
  await reading(0, 65);
  let s = await status(table.id);
  assert.ok(s.monitoring_since, "streak started");
  assert.equal(s.led_critical, false, "not confirmed on the first loud reading");
  await label(1, "Loud Conversation", 0.85, "Speech");
  await reading(1, 72);
  await loud(reading, 2, 9, 66);
  assert.equal((await incidents(table.id)).length, 0, "still inside the window");

  await reading(10, 67);
  s = await status(table.id);
  assert.equal(s.led_critical, true);
  const rows = await incidents(table.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "CONFIRMED");
  assert.equal(rows[0].category, "Loud Conversation");
  assert.equal(rows[0].top_class, "Speech");
  assert.equal(Number(rows[0].confidence), 0.85);
  assert.equal(Number(rows[0].peak_db), 72, "the loudest reading, not the last one");
  assert.equal(Number(rows[0].db_level), 72);
  assert.equal(rows[0].bulb_triggered, true);
  assert.equal(rows[0].filter_reason, null);
  assert.equal(rows[0].occupant_id, occupant.id);
  assert.equal(new Date(rows[0].occurred_at).getTime(), at(0).getTime(), "occurred_at is the streak start");
  assert.equal((await violations(table.id)).length, 1);

  await reading(11, 68);
  assert.equal((await incidents(table.id)).length, 1, "same streak doesn't create a second incident");

  await loud(reading, 12, 15, 40);
  s = await status(table.id);
  assert.equal(s.led_critical, false, "bulb off once the streak ends");
  assert.equal(s.monitoring_since, null);
  assert.ok(new Date(s.cooldown_until) > at(15), "cooldown set after a decided streak");
});

test("IGNORED never lights the bulb or creates a strike", async () => {
  const { table, reading, label } = await setup();
  await reading(0, 75);
  await label(1, "Impact Noise", 0.9, "Door");
  await label(2, "Ambient Baseline", 0.8, "Typing");
  await label(3, "Loud Conversation", 0.95, "Speech");
  let lit = false;
  for (let s = 1; s <= 14; s++) {
    await reading(s, 75);
    if ((await status(table.id)).led_critical) lit = true;
  }
  assert.equal(lit, false, "critical bulb never lit");
  const rows = await incidents(table.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "IGNORED");
  assert.equal(rows[0].filter_reason, "non_violation_category");
  assert.equal(rows[0].category, "Impact Noise");
  assert.equal(rows[0].top_class, "Door");
  assert.equal(rows[0].bulb_triggered, false);
  assert.equal((await violations(table.id)).length, 0, "no strike");
});

test("no label while the ML service is down -> UNVERIFIED at the sustained time, no waiting", async () => {
  const { table, reading } = await setup();
  await loud(reading, 0, 10);
  const rows = await incidents(table.id);
  assert.equal(rows.length, 1, "decided at 10 s without waiting for a label");
  assert.equal(rows[0].status, "UNVERIFIED");
  assert.equal(rows[0].filter_reason, "no_classification");
  assert.equal(rows[0].category, null);
  assert.equal(rows[0].bulb_triggered, false);
  assert.equal((await status(table.id)).led_critical, false);
  assert.equal((await violations(table.id)).length, 0);
});

test("only low-confidence labels -> UNVERIFIED (low_confidence)", async () => {
  const { table, reading, label } = await setup();
  await reading(0, 70);
  await label(1, "Loud Conversation", 0.3, "Speech");
  await loud(reading, 1, 10);
  const [row] = await incidents(table.id);
  assert.equal(row.status, "UNVERIFIED");
  assert.equal(row.filter_reason, "low_confidence");
  assert.equal(row.top_class, "Speech");
});

test("a short spike is dropped with no incident", async () => {
  const { table, reading } = await setup();
  await reading(0, 70);
  await loud(reading, 1, 4, 45);
  assert.equal((await status(table.id)).monitoring_since, null);
  assert.equal((await incidents(table.id)).length, 0);
});

test("dip tolerance: a dip of up to 2 s keeps the streak, a longer one ends it", async () => {
  const short = await setup();
  await loud(short.reading, 0, 4);
  await short.reading(5, 45); // 1 s dip
  await short.reading(6, 45); // 2 s dip
  await loud(short.reading, 7, 10);
  assert.equal((await incidents(short.table.id)).length, 1, "the 2 s dip did not restart the 10 s count");
  assert.equal(new Date((await incidents(short.table.id))[0].occurred_at).getTime(), at(0).getTime());

  const long = await setup();
  await loud(long.reading, 0, 4);
  await loud(long.reading, 5, 7, 45); // 3 s dip: streak over
  assert.equal((await status(long.table.id)).monitoring_since, null);
  await loud(long.reading, 8, 17);
  assert.equal((await incidents(long.table.id)).length, 0, "a new streak started at 8 s and has not reached 10 s");
  await long.reading(18, 70);
  assert.equal((await incidents(long.table.id)).length, 1);
  assert.equal(new Date((await incidents(long.table.id))[0].occurred_at).getTime(), at(8).getTime());
});

test("a reading gap discards the streak instead of confirming it late", async () => {
  const { table, reading, label } = await setup();
  await loud(reading, 0, 8);
  await label(5, "Loud Conversation", 0.9);
  // The node goes silent for 20 s and comes back loud.
  await reading(28, 70);
  assert.equal((await incidents(table.id)).length, 0, "no incident for the interrupted streak");
  const s = await status(table.id);
  assert.equal(new Date(s.monitoring_since).getTime(), at(28).getTime(), "a fresh streak started from now");
  assert.deepEqual(s.streak_labels, [], "old labels were dropped");
});

test("cooldown: no new streak for 120 s after a decided streak", async () => {
  const { table, reading } = await setup();
  await loud(reading, 0, 10); // UNVERIFIED at 10 s (ML down)
  await loud(reading, 11, 13, 40); // quiet: streak ends at 13 s, cooldown until 133 s
  assert.equal((await incidents(table.id)).length, 1);
  await loud(reading, 14, 40);
  assert.equal((await status(table.id)).monitoring_since, null, "loud readings during the cooldown start nothing");
  assert.equal((await incidents(table.id)).length, 1);
  for (let s = 41; s <= 132; s += 1) await reading(s, 40);
  await loud(reading, 133, 143);
  assert.equal((await incidents(table.id)).length, 2, "after the cooldown a new streak is decided again");
});

test("phone labels qualify after a shorter sustained time", async () => {
  const { table, reading, label } = await setup();
  await reading(0, 70);
  await label(1, "Mobile Phone Noise", 0.9, "Ringtone");
  await loud(reading, 1, 3);
  assert.equal((await incidents(table.id)).length, 0);
  await reading(4, 70);
  const [row] = await incidents(table.id);
  assert.equal(row.status, "CONFIRMED");
  assert.equal(row.category, "Mobile Phone Noise");
  assert.equal(row.duration_seconds, 4);
});

test("while the ML service is up the engine waits up to 8 s for a label", async () => {
  env.mlServiceUrl = fakeMl.url;
  assert.equal(await checkMlHealth(), true);

  const withLabel = await setup();
  await loud(withLabel.reading, 0, 12);
  assert.equal((await incidents(withLabel.table.id)).length, 0, "sustained, but waiting for a label");
  await withLabel.label(12, "Music", 0.8, "Guitar");
  await withLabel.reading(13, 70);
  const [row] = await incidents(withLabel.table.id);
  assert.equal(row.status, "CONFIRMED");
  assert.equal(row.category, "Music");
  assert.equal(row.bulb_triggered, true);

  const noLabel = await setup();
  await loud(noLabel.reading, 0, 17);
  assert.equal((await incidents(noLabel.table.id)).length, 0, "still inside the 8 s wait");
  await noLabel.reading(18, 70);
  const [late] = await incidents(noLabel.table.id);
  assert.equal(late.status, "UNVERIFIED");
  assert.equal(late.filter_reason, "no_classification");
});

test("a streak that ends while waiting for its label is decided without the bulb", async () => {
  env.mlServiceUrl = fakeMl.url;
  await checkMlHealth();
  const { table, reading, label } = await setup();
  await loud(reading, 0, 11);
  await loud(reading, 12, 14, 40); // quiet: streak over, still within the wait
  assert.equal((await incidents(table.id)).length, 0);
  await label(15, "Loud Conversation", 0.9, "Shout");
  await reading(15, 40);
  const [row] = await incidents(table.id);
  assert.equal(row.status, "CONFIRMED", "it was a violation");
  assert.equal(row.bulb_triggered, false, "but the streak was over, so the bulb was never lit");
  assert.equal((await status(table.id)).led_critical, false);
  assert.equal((await violations(table.id)).length, 1);
});

test("a PAUSED table gives IGNORED (table_paused)", async () => {
  const { table, reading, label } = await setup({ status: "PAUSED" });
  await reading(0, 70);
  await label(1, "Loud Conversation", 0.95);
  await loud(reading, 1, 10);
  const [row] = await incidents(table.id);
  assert.equal(row.status, "IGNORED");
  assert.equal(row.filter_reason, "table_paused");
  assert.equal(row.bulb_triggered, false);
  assert.equal((await violations(table.id)).length, 0);
});

test("the violation goes to whoever sat there when the streak started", async () => {
  const { table, occupant: first, reading, label } = await setup();
  await reading(0, 70);
  await label(1, "Loud Conversation", 0.9);
  await loud(reading, 1, 5);
  // Seat change in the middle of the streak.
  await query("UPDATE table_assignments SET released_at = $2 WHERE table_id = $1 AND released_at IS NULL", [table.id, at(5.5)]);
  const second = await createOccupant();
  await query("INSERT INTO table_assignments (table_id, occupant_id, assigned_at) VALUES ($1, $2, $3)", [table.id, second.id, at(5.6)]);
  await loud(reading, 6, 10);
  const [row] = await incidents(table.id);
  assert.equal(row.occupant_id, first.id);
  assert.equal((await violations(table.id))[0].occupant_id, first.id);
});

test("audio is requested at the streak start, then every 5 s", async () => {
  const { table, reading } = await setup({ confirmation_seconds: 30 });
  await reading(0, 70);
  assert.equal(new Date((await status(table.id)).last_audio_requested_at).getTime(), at(0).getTime());
  await loud(reading, 1, 4);
  assert.equal(new Date((await status(table.id)).last_audio_requested_at).getTime(), at(0).getTime(), "throttled");
  await reading(5, 70);
  assert.equal(new Date((await status(table.id)).last_audio_requested_at).getTime(), at(5).getTime());
});

test("audio clips append labels to the streak atomically", async () => {
  env.mlServiceUrl = fakeMl.url;
  let n = 0;
  fakeMl.setResponse(() => ({ category: "Loud Conversation", confidence: 0.6 + (n++ % 3) / 10, top_class: "Speech" }));
  const { node, table, reading } = await setup({ confirmation_seconds: 30 });
  await reading(0, 70);
  await Promise.all(Array.from({ length: 5 }, () => ingestAudioClip(node, fakeWav(), { now: at(1) })));
  const s = await status(table.id);
  assert.equal(s.streak_labels.length, 5, "no label was lost");
  assert.equal(s.streak_labels[0].category, "Loud Conversation");
  assert.equal(s.streak_labels[0].top_class, "Speech");
  assert.equal(s.classification, "Loud Conversation");
  fakeMl.setResponse(() => ({ category: "Loud Conversation", confidence: 0.9, top_class: "Speech" }));
});

test("offline status cancels an undecided streak; ML label is kept until the table is quiet", async () => {
  const { node, table, reading } = await setup();
  await loud(reading, 0, 3);
  await ingestStatus(node, { online: false });
  let s = await status(table.id);
  assert.equal(s.is_online, false);
  assert.equal(s.monitoring_since, null);

  await query("UPDATE sensor_status SET classification = 'Impact Noise', confidence = 0.9 WHERE table_id = $1", [table.id]);
  await reading(4, 55);
  s = await status(table.id);
  assert.equal(s.classification, "Impact Noise", "a reading without a label keeps the ML label");
  assert.equal(s.is_online, true);
  await reading(5, 40);
  assert.equal((await status(table.id)).classification, null, "cleared once the table is quiet");
});

test("unknown nodes are ignored", async () => {
  await ingestTelemetry("NODE-UNKNOWN", { db_level: 70 });
  await ingestStatus("NODE-UNKNOWN", { online: true });
});
