// Violation retention: violations older than VIOLATION_RETENTION_DAYS
// (default 30) are deleted, so strikes only count the recent past. A
// running ban is stored on the occupant and is not affected.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, createOccupant, assign, bearer, query } from "./helpers.js";
import { cleanupOldViolations } from "../src/services/violationsService.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

let seq = 0;
const readyOccupant = () => createOccupant({ email: `retention${++seq}@test.local`, password: "Password123" });
const incident = tableId => api().post("/api/incidents").set(auth).send({ table_id: tableId, category: "Loud Conversation", db_level: 65 });
const getOccupant = async id => (await api().get(`/api/occupants/${id}`).set(auth)).body.occupant;
const violationIds = async occupantId => (await query("SELECT id FROM violations WHERE occupant_id = $1 ORDER BY id", [occupantId])).rows.map(r => r.id);

// Moves one violation back in time by `days`.
const ageViolation = (id, days) => query("UPDATE violations SET created_at = NOW() - make_interval(days => $2) WHERE id = $1", [id, days]);

test("cleanup deletes a 31-day-old violation and keeps a 29-day-old one", async () => {
  const table = await createTable();
  const o = await readyOccupant();
  await assign(o.id, table.id);
  await incident(table.id);
  await incident(table.id);
  const [oldId, recentId] = await violationIds(o.id);
  await ageViolation(oldId, 31);
  await ageViolation(recentId, 29);

  const deleted = await cleanupOldViolations(30);
  assert.equal(deleted, 1);
  assert.deepEqual(await violationIds(o.id), [recentId]);
});

test("two old (deleted) violations + one new one = 1 strike, not a ban", async () => {
  const table = await createTable();
  const o = await readyOccupant();
  await assign(o.id, table.id);
  await incident(table.id);
  await incident(table.id);
  for (const id of await violationIds(o.id)) await ageViolation(id, 31);
  await cleanupOldViolations(30);

  await incident(table.id);
  const occ = await getOccupant(o.id);
  assert.equal(occ.status, "ACTIVE");
  assert.equal(occ.strikes, 1);
  assert.equal(occ.table?.id, table.id, "still seated");
});

test("a banned occupant stays banned until ban_until after cleanup", async () => {
  const table = await createTable();
  const o = await readyOccupant();
  await assign(o.id, table.id);
  for (let i = 0; i < 3; i++) await incident(table.id);
  let occ = await getOccupant(o.id);
  assert.equal(occ.status, "BANNED");
  const banUntil = occ.ban_until;

  for (const id of await violationIds(o.id)) await ageViolation(id, 31);
  assert.ok((await cleanupOldViolations(30)) >= 3);
  assert.deepEqual(await violationIds(o.id), []);

  occ = await getOccupant(o.id);
  assert.equal(occ.status, "BANNED", "ban is not lifted by the cleanup");
  assert.equal(occ.ban_until, banUntil, "ban end date unchanged");
  const blocked = await api().post(`/api/occupants/${o.id}/assign`).set(auth).send({ table_id: table.id });
  assert.equal(blocked.status, 409);
});

test("VIOLATION_RETENTION_DAYS: default 30, custom value, bad values rejected", () => {
  const read = value => {
    const childEnv = { ...process.env, NODE_ENV: "test" };
    if (value === undefined) delete childEnv.VIOLATION_RETENTION_DAYS;
    else childEnv.VIOLATION_RETENTION_DAYS = value;
    // Run from the temp folder so server/.env isn't loaded.
    return execFileSync(process.execPath, ["--input-type=module", "-e", "const { env } = await import(process.argv[1]); console.log(env.violationRetentionDays);", new URL("../src/config/env.js", import.meta.url).href], {
      env: childEnv,
      cwd: tmpdir(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  };
  assert.equal(read(undefined), "30");
  assert.equal(read("14"), "14");
  for (const bad of ["0", "-1", "1.5", "abc"]) assert.throws(() => read(bad), undefined, `${bad} must be rejected`);
});
