// Occupant list/edit/delete (no admin create), assign/release rules, violation history, lifting a ban.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, createOccupant, bearer, query } from "./helpers.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

// An occupant who signed up and set a password (allowed to be seated).
let seq = 0;
const readyOccupant = () => createOccupant({ email: `ready${++seq}@test.local`, password: "Password123" });

test("admins can't create occupants; search, update, delete still work", async () => {
  assert.equal((await api().post("/api/occupants").set(auth).send({ full_name: "Rosa Diaz", email: "rosa@example.com" })).status, 404);

  const o = await createOccupant({ email: "rosa@example.com", password: "Password123" });
  const search = await api().get("/api/occupants?q=rosa").set(auth);
  assert.equal(search.body.occupants.length, 1);
  assert.equal(search.body.occupants[0].password_hash, undefined);
  assert.equal(search.body.occupants[0].account_ready, true);
  const wildcard = await api().get("/api/occupants?q=%25").set(auth);
  assert.equal(wildcard.body.occupants.length, 0, "% is searched literally");

  const updated = await api().put(`/api/occupants/${o.id}`).set(auth).send({ full_name: "Rosa D.", contact: "0917" });
  assert.equal(updated.body.occupant.full_name, "Rosa D.");
  assert.equal(updated.body.occupant.contact, "0917");
  assert.equal(updated.body.occupant.email, "rosa@example.com");
  const sameEmail = await api().put(`/api/occupants/${o.id}`).set(auth).send({ full_name: "Rosa", email: "ROSA@example.com" });
  assert.equal(sameEmail.status, 200, "sending the unchanged email is fine");
  for (const email of ["other@example.com", ""]) {
    const res = await api().put(`/api/occupants/${o.id}`).set(auth).send({ email });
    assert.equal(res.status, 400, `email "${email}" can't be set by an admin`);
  }
  assert.equal((await api().get(`/api/occupants/${o.id}`).set(auth)).body.occupant.email, "rosa@example.com");
  assert.equal((await api().put(`/api/occupants/${o.id}`).set(auth).send({ status: "BANNED" })).status, 400, "bans can't be set by hand");

  assert.equal((await api().delete(`/api/occupants/${o.id}`).set(auth)).status, 204);
  assert.equal((await api().get(`/api/occupants/${o.id}`).set(auth)).status, 404);
});

test("only occupants who finished signing up can be assigned", async () => {
  const table = await createTable();
  const noPassword = await createOccupant({ email: "nopass@test.local" });
  const unverified = await createOccupant({ email: "unverified@test.local", password: "Password123", verified: false });
  for (const o of [noPassword, unverified]) {
    const res = await api().post(`/api/occupants/${o.id}/assign`).set(auth).send({ table_id: table.id });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "This occupant hasn't finished setting up their account.");
    assert.equal((await api().get(`/api/occupants/${o.id}`).set(auth)).body.occupant.account_ready, false);
  }
  const ready = await readyOccupant();
  assert.equal((await api().post(`/api/occupants/${ready.id}/assign`).set(auth).send({ table_id: table.id })).status, 200);
});

test("assign and release rules", async () => {
  const table = await createTable();
  const other = await createTable();
  const a = await readyOccupant();
  const b = await readyOccupant();

  assert.equal((await api().post(`/api/occupants/${a.id}/assign`).set(auth).send({})).status, 400);
  assert.equal((await api().post(`/api/occupants/${a.id}/assign`).set(auth).send({ table_id: 999999 })).status, 404);
  const ok = await api().post(`/api/occupants/${a.id}/assign`).set(auth).send({ table_id: table.id });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.occupant.table.id, table.id);

  const tableTaken = await api().post(`/api/occupants/${b.id}/assign`).set(auth).send({ table_id: table.id });
  assert.equal(tableTaken.status, 409);
  const alreadySeated = await api().post(`/api/occupants/${a.id}/assign`).set(auth).send({ table_id: other.id });
  assert.equal(alreadySeated.status, 409);

  const tableView = await api().get(`/api/tables/${table.id}`).set(auth);
  assert.equal(tableView.body.table.occupant.id, a.id);

  assert.equal((await api().post(`/api/occupants/${a.id}/release`).set(auth)).status, 200);
  assert.equal((await api().post(`/api/occupants/${a.id}/release`).set(auth)).status, 409);
  assert.equal((await api().post(`/api/occupants/${b.id}/assign`).set(auth).send({ table_id: table.id })).status, 200);
});

test("banned occupants can't be assigned; an admin can lift the ban early", async () => {
  const table = await createTable();
  const o = await readyOccupant();
  await query("UPDATE occupants SET status='BANNED', ban_started_at=NOW(), ban_until=NOW() + INTERVAL '7 days', strikes_since=NOW() WHERE id=$1", [o.id]);

  const blocked = await api().post(`/api/occupants/${o.id}/assign`).set(auth).send({ table_id: table.id });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /banned/);

  const lifted = await api().put(`/api/occupants/${o.id}`).set(auth).send({ status: "ACTIVE" });
  assert.equal(lifted.body.occupant.status, "ACTIVE");
  assert.equal(lifted.body.occupant.ban_until, null);
  assert.equal((await api().post(`/api/occupants/${o.id}/assign`).set(auth).send({ table_id: table.id })).status, 200);
});

test("violation history endpoint", async () => {
  const o = await createOccupant();
  const res = await api().get(`/api/occupants/${o.id}/violations`).set(auth);
  assert.deepEqual(res.body.violations, []);
  assert.equal((await api().get("/api/occupants/999999/violations").set(auth)).status, 404);
});
