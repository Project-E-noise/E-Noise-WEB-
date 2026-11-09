// Incidents, the violation it creates, and the 3-strike / one-week ban
// rule, all inside one transaction.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, createOccupant, assign, bearer, query } from "./helpers.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

const incident = (tableId, extra = {}) => api().post("/api/incidents").set(auth).send({ table_id: tableId, category: "Loud Conversation", db_level: 65, ...extra });

test("incident validation", async () => {
  const table = await createTable();
  const bad = [
    [{ table_id: undefined }, /Table is required/],
    [{ category: "Shouting" }, /Category must be one of/],
    [{ db_level: "loud" }, /must be a number/],
    [{ db_level: 500 }, /between 0 and 200/],
    [{ confidence: 87 }, /between 0 and 1/],
    [{ status: "MAYBE" }, /Status must be one of/],
    [{ occurred_at: "yesterday" }, /valid date/],
    [{ notes: "x".repeat(1001) }, /1000 characters/],
    [{ bulb_triggered: "yes" }, /true or false/],
    [{ occupant_id: 999999 }, /Occupant not found/]
  ];
  for (const [change, message] of bad) {
    const res = await incident(table.id, change);
    assert.ok([400, 404].includes(res.status), JSON.stringify(change));
    assert.match(res.body.error, message);
  }
  assert.equal((await incident(999999)).status, 404);
});

test("CRUD and the table's current occupant is linked automatically", async () => {
  const table = await createTable();
  const o = await createOccupant();
  await assign(o.id, table.id);

  const created = await incident(table.id, { confidence: 0.87, notes: "=HYPERLINK(\"x\")" });
  assert.equal(created.status, 201);
  const i = created.body.incident;
  assert.equal(i.occupant.id, o.id);
  assert.equal(i.table.table_number, table.table_number);
  assert.equal(i.confidence, 0.87);

  assert.equal((await api().get(`/api/incidents/${i.id}`).set(auth)).body.incident.id, i.id);
  const list = await api().get(`/api/incidents?table_id=${table.id}`).set(auth);
  assert.equal(list.body.incidents.length, 1);

  const updated = await api().put(`/api/incidents/${i.id}`).set(auth).send({ notes: "Reminder given", confidence: null });
  assert.equal(updated.body.incident.notes, "Reminder given");
  assert.equal(updated.body.incident.confidence, null);
  assert.equal(updated.body.incident.category, "Loud Conversation", "fields not sent stay the same");

  assert.equal((await api().put(`/api/incidents/${i.id}`).set(auth).send({ category: "nope" })).status, 400);
  assert.equal((await api().delete(`/api/incidents/${i.id}`).set(auth)).status, 204);
  assert.equal((await api().get(`/api/incidents/${i.id}`).set(auth)).status, 404);
  const violations = await query("SELECT * FROM violations WHERE incident_id = $1", [i.id]);
  assert.equal(violations.rows.length, 0, "violation is deleted with its incident");
});

test("3 confirmed incidents -> one-week ban, seat released, strikes reset", async () => {
  const table = await createTable();
  const o = await createOccupant({ email: "strikes@test.local", password: "Password123" });
  await assign(o.id, table.id);

  await incident(table.id);
  await incident(table.id, { status: "DISMISSED" }); // doesn't count
  let occ = (await api().get(`/api/occupants/${o.id}`).set(auth)).body.occupant;
  assert.equal(occ.strikes, 1);
  assert.equal(occ.status, "ACTIVE");

  await incident(table.id);
  await incident(table.id);
  occ = (await api().get(`/api/occupants/${o.id}`).set(auth)).body.occupant;
  assert.equal(occ.status, "BANNED");
  assert.equal(occ.violation_count, 3);
  assert.equal(occ.table, null, "banned occupant was released from the table");
  const days = (new Date(occ.ban_until) - new Date(occ.ban_started_at)) / 86400000;
  assert.equal(Math.round(days), 7);

  const numbers = (await api().get(`/api/occupants/${o.id}/violations`).set(auth)).body.violations.map(v => v.violation_number);
  assert.deepEqual(numbers, [1, 2, 3]);

  // Pretend the week has passed.
  await query("UPDATE occupants SET ban_started_at = ban_started_at - INTERVAL '8 days', ban_until = ban_until - INTERVAL '8 days', strikes_since = strikes_since - INTERVAL '8 days' WHERE id = $1", [o.id]);
  await query("UPDATE violations SET created_at = created_at - INTERVAL '8 days' WHERE occupant_id = $1", [o.id]);

  occ = (await api().get(`/api/occupants/${o.id}`).set(auth)).body.occupant;
  assert.equal(occ.status, "ACTIVE", "ban ended by itself");
  assert.equal(occ.ban_until, null);
  assert.equal(occ.strikes, 0, "strikes start again after a ban");

  const client = await api().get("/api/client/violations").set(bearer(o.token));
  assert.equal(client.body.is_banned, false);
  assert.equal(client.body.current_violation_count, 0);
  assert.equal(client.body.total, 3, "history is kept");

  // The next violation is strike 1, not an instant re-ban.
  assert.equal((await api().post(`/api/occupants/${o.id}/assign`).set(auth).send({ table_id: table.id })).status, 200);
  await incident(table.id);
  occ = (await api().get(`/api/occupants/${o.id}`).set(auth)).body.occupant;
  assert.equal(occ.status, "ACTIVE");
  assert.equal(occ.strikes, 1);
  assert.equal(occ.violation_count, 4);
});

test("changing an incident to DISMISSED removes its violation, and back to CONFIRMED adds it", async () => {
  const table = await createTable();
  const o = await createOccupant();
  await assign(o.id, table.id);
  const i = (await incident(table.id)).body.incident;
  assert.equal((await query("SELECT * FROM violations WHERE incident_id = $1", [i.id])).rows.length, 1);

  await api().put(`/api/incidents/${i.id}`).set(auth).send({ status: "DISMISSED" });
  assert.equal((await query("SELECT * FROM violations WHERE incident_id = $1", [i.id])).rows.length, 0);

  await api().put(`/api/incidents/${i.id}`).set(auth).send({ status: "CONFIRMED" });
  assert.equal((await query("SELECT * FROM violations WHERE incident_id = $1", [i.id])).rows.length, 1);
});

test("incident + violation are atomic: if the violation fails, no incident is saved", async () => {
  const table = await createTable();
  const o = await createOccupant();
  await assign(o.id, table.id);
  await query(`CREATE FUNCTION fail_violation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql;
               CREATE TRIGGER fail_violation BEFORE INSERT ON violations FOR EACH ROW EXECUTE FUNCTION fail_violation();`);
  try {
    const res = await incident(table.id);
    assert.equal(res.status, 500);
    assert.equal(res.body.stack, undefined, "no stack trace is sent");
    const saved = await query("SELECT * FROM incidents WHERE table_id = $1", [table.id]);
    assert.equal(saved.rows.length, 0, "incident was rolled back");
  } finally {
    await query("DROP TRIGGER fail_violation ON violations; DROP FUNCTION fail_violation();");
  }
});

test("incidents at the same moment still give exactly one ban (row lock)", async () => {
  const table = await createTable();
  const o = await createOccupant();
  await assign(o.id, table.id);
  await incident(table.id);
  const results = await Promise.all([incident(table.id), incident(table.id), incident(table.id)]);
  assert.ok(results.every(r => r.status === 201));

  const occ = (await api().get(`/api/occupants/${o.id}`).set(auth)).body.occupant;
  assert.equal(occ.status, "BANNED");
  // The ban releases the seat, so an incident that was still looking up
  // the seat may find nobody there: 3 or 4 violations are both correct.
  assert.ok(occ.violation_count >= 3);
  const numbers = (await query("SELECT violation_number FROM violations WHERE occupant_id = $1 ORDER BY 1", [o.id])).rows.map(r => r.violation_number);
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), "no duplicate or skipped violation numbers");
  const bans = await query("SELECT ban_started_at FROM occupants WHERE id = $1", [o.id]);
  assert.ok(bans.rows[0].ban_started_at);
});
