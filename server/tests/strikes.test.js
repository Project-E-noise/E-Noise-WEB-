// Strikes and bans after violation gating: the daily strike cap, lifting a
// ban by recounting when an incident leaves CONFIRMED, and confirming a
// filtered incident (category required).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, createOccupant, assign, bearer, query } from "./helpers.js";
import { env } from "../src/config/env.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);
beforeEach(() => {
  env.maxStrikesPerDay = 1;
});

const post = (tableId, extra = {}) =>
  api().post("/api/incidents").set(auth).send({ table_id: tableId, category: "Loud Conversation", db_level: 65, ...extra });
const put = (id, body) => api().put(`/api/incidents/${id}`).set(auth).send(body);
const occupantOf = async id => (await api().get(`/api/occupants/${id}`).set(auth)).body.occupant;
const violationsOf = async id => (await query("SELECT * FROM violations WHERE occupant_id = $1 ORDER BY id", [id])).rows;

// Moves everything about an occupant `hours` into the past (violations,
// ban dates, strike windows), as if that time had passed.
async function age(occupantId, hours) {
  const shift = `make_interval(hours => ${Number(hours)})`;
  await query(`UPDATE violations SET created_at = created_at - ${shift} WHERE occupant_id = $1`, [occupantId]);
  await query(
    `UPDATE occupants SET ban_started_at = ban_started_at - ${shift}, ban_until = ban_until - ${shift},
       strikes_since = strikes_since - ${shift}, ban_strikes_since = ban_strikes_since - ${shift} WHERE id = $1`,
    [occupantId]
  );
}

async function seated() {
  const table = await createTable();
  const o = await createOccupant({ email: `o${Date.now()}${Math.random()}@test.local`, password: "Password123" });
  await assign(o.id, table.id);
  return { table, o };
}

// Three strikes on three different days -> banned.
async function banned() {
  const { table, o } = await seated();
  const ids = [];
  for (let day = 0; day < 3; day++) {
    if (day) await age(o.id, 25);
    ids.push((await post(table.id)).body.incident.id);
  }
  assert.equal((await occupantOf(o.id)).status, "BANNED");
  return { table, o, ids };
}

test("daily strike cap: a second confirmed incident within 24 h is not a strike", async () => {
  const { table, o } = await seated();
  const first = await post(table.id);
  const second = await post(table.id);
  assert.equal(second.status, 201);
  assert.equal(second.body.incident.status, "CONFIRMED", "still logged as a violation");
  assert.equal((await violationsOf(o.id)).length, 1, "but only one strike");
  assert.equal((await occupantOf(o.id)).strikes, 1);

  await age(o.id, 25);
  await post(table.id);
  assert.equal((await violationsOf(o.id)).length, 2, "a day later it counts again");
  assert.ok(first.body.incident.id);
});

test("continuous noise can't ban someone within minutes", async () => {
  const { table, o } = await seated();
  for (let i = 0; i < 6; i++) await post(table.id);
  const occ = await occupantOf(o.id);
  assert.equal(occ.status, "ACTIVE");
  assert.equal(occ.strikes, 1);
});

test("the cap is configurable", async () => {
  env.maxStrikesPerDay = 3;
  const { table, o } = await seated();
  for (let i = 0; i < 3; i++) await post(table.id);
  assert.equal((await occupantOf(o.id)).status, "BANNED");
  assert.equal((await violationsOf(o.id)).length, 3);
});

test("dismissing one of the ban's strikes deletes it and lifts the ban by recount", async () => {
  const { o, ids } = await banned();
  const res = await put(ids[1], { status: "DISMISSED" });
  assert.equal(res.status, 200, res.body.error);
  assert.equal((await query("SELECT * FROM violations WHERE incident_id = $1", [ids[1]])).rows.length, 0);
  const occ = await occupantOf(o.id);
  assert.equal(occ.status, "ACTIVE", "2 strikes left: ban lifted");
  assert.equal(occ.strikes, 2, "the remaining strikes count again");
  assert.equal(occ.ban_until, null);
});

test("moving a strike to IGNORED also lifts the ban", async () => {
  const { o, ids } = await banned();
  assert.equal((await put(ids[0], { status: "IGNORED", filter_reason: "non_violation_category" })).status, 200);
  assert.equal((await occupantOf(o.id)).status, "ACTIVE");
});

test("a strike from an earlier ban period doesn't lift the current ban", async () => {
  const first = await banned();
  // The first ban ran out a while ago.
  await age(first.o.id, 9 * 24);
  assert.equal((await occupantOf(first.o.id)).status, "ACTIVE");
  await assign(first.o.id, first.table.id).catch(() => {});
  const newer = [];
  for (let day = 0; day < 3; day++) {
    if (day) await age(first.o.id, 25);
    newer.push((await post(first.table.id)).body.incident.id);
  }
  assert.equal((await occupantOf(first.o.id)).status, "BANNED", "second ban");

  await put(first.ids[0], { status: "DISMISSED" });
  assert.equal((await occupantOf(first.o.id)).status, "BANNED", "an old-period strike doesn't change this ban");

  await put(newer[2], { status: "DISMISSED" });
  const occ = await occupantOf(first.o.id);
  assert.equal(occ.status, "ACTIVE", "one of this ban's strikes removed: lifted");
  assert.equal(occ.strikes, 2);
});

test("strikes only count the 30-day window", async () => {
  const { table, o } = await seated();
  await post(table.id);
  await age(o.id, 31 * 24);
  assert.equal((await occupantOf(o.id)).strikes, 0, "a 31-day-old violation is no longer a strike");
  await post(table.id);
  assert.equal((await occupantOf(o.id)).strikes, 1);
});

test("confirming a filtered incident needs a violation category, then creates the strike", async () => {
  const { table, o } = await seated();
  const filtered = (await post(table.id, { category: null, status: "UNVERIFIED", filter_reason: "no_classification" })).body.incident;
  assert.equal((await violationsOf(o.id)).length, 0, "filtered incidents are never strikes");

  const noCategory = await put(filtered.id, { status: "CONFIRMED" });
  assert.equal(noCategory.status, 400);
  assert.match(noCategory.body.error, /Choose a category/);

  const wrongCategory = await put(filtered.id, { status: "CONFIRMED", category: "Impact Noise" });
  assert.equal(wrongCategory.status, 400);
  assert.match(wrongCategory.body.error, /Loud Conversation, Mobile Phone Noise, Music/);

  const ok = await put(filtered.id, { status: "CONFIRMED", category: "Music" });
  assert.equal(ok.status, 200, ok.body.error);
  assert.equal(ok.body.incident.status, "CONFIRMED");
  assert.equal(ok.body.incident.category, "Music");
  assert.equal((await violationsOf(o.id)).length, 1);
});

test("a new CONFIRMED incident must use a violation category", async () => {
  const { table } = await seated();
  const res = await post(table.id, { category: "Impact Noise" });
  assert.equal(res.status, 400);
  const ignored = await post(table.id, { category: "Impact Noise", status: "IGNORED" });
  assert.equal(ignored.status, 201, "impact noise can still be logged for review");
});

test("editing notes on an old CONFIRMED row with a non-violation category still works", async () => {
  const { table } = await seated();
  const { rows } = await query(
    "INSERT INTO incidents (table_id, category, db_level, status, occurred_at) VALUES ($1, 'Impact Noise', 66, 'CONFIRMED', NOW()) RETURNING id",
    [table.id]
  );
  const res = await put(rows[0].id, { notes: "legacy row" });
  assert.equal(res.status, 200, res.body.error);
});

test("deleting one of the ban's incidents also lifts the ban by recount", async () => {
  const { o, ids } = await banned();
  assert.equal((await api().delete(`/api/incidents/${ids[2]}`).set(auth)).status, 204);
  const occ = await occupantOf(o.id);
  assert.equal(occ.status, "ACTIVE");
  assert.equal(occ.strikes, 2);
});
