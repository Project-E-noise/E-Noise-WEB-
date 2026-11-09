// Occupant CRUD, assign/release rules, violation history, lifting a ban.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, createOccupant, bearer, query } from "./helpers.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

test("create, search, update, delete occupants", async () => {
  const created = await api().post("/api/occupants").set(auth).send({ full_name: " Rosa Diaz ", email: "Rosa@Example.com", contact: "0917" });
  assert.equal(created.status, 201);
  const o = created.body.occupant;
  assert.equal(o.full_name, "Rosa Diaz");
  assert.equal(o.email, "rosa@example.com");
  assert.equal(o.strikes, 0);
  assert.equal(o.password_hash, undefined);

  assert.equal((await api().post("/api/occupants").set(auth).send({ full_name: "Dup", email: "ROSA@example.com" })).status, 409);
  assert.equal((await api().post("/api/occupants").set(auth).send({ full_name: "" })).status, 400);
  assert.equal((await api().post("/api/occupants").set(auth).send({ full_name: "X", email: "nope" })).status, 400);

  const search = await api().get("/api/occupants?q=rosa").set(auth);
  assert.equal(search.body.occupants.length, 1);
  const wildcard = await api().get("/api/occupants?q=%25").set(auth);
  assert.equal(wildcard.body.occupants.length, 0, "% is searched literally");

  const updated = await api().put(`/api/occupants/${o.id}`).set(auth).send({ full_name: "Rosa D.", email: "" });
  assert.equal(updated.body.occupant.full_name, "Rosa D.");
  assert.equal(updated.body.occupant.email, null);
  assert.equal((await api().put(`/api/occupants/${o.id}`).set(auth).send({ status: "BANNED" })).status, 400, "bans can't be set by hand");

  assert.equal((await api().delete(`/api/occupants/${o.id}`).set(auth)).status, 204);
  assert.equal((await api().get(`/api/occupants/${o.id}`).set(auth)).status, 404);
});

test("assign and release rules", async () => {
  const table = await createTable();
  const other = await createTable();
  const a = await createOccupant();
  const b = await createOccupant();

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
  const o = await createOccupant();
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
