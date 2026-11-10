// Data retention: raw noise readings (NOISE_READINGS_RETENTION_DAYS, default
// 7) and personal links older than VIOLATION_RETENTION_DAYS (default 30):
// incidents lose their occupant, released seat history is deleted.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resetDatabase, closeDatabase, createTable, createOccupant, query } from "./helpers.js";
import { cleanupOldReadings, cleanupPersonalData } from "../src/services/retentionService.js";

before(resetDatabase);
after(closeDatabase);

const addReading = (tableId, daysAgo) =>
  query("INSERT INTO noise_readings (table_id, db_level, recorded_at) VALUES ($1, 45, NOW() - make_interval(days => $2)) RETURNING id", [tableId, daysAgo]).then(r => r.rows[0].id);
const readingIds = async tableId => (await query("SELECT id FROM noise_readings WHERE table_id = $1 ORDER BY id", [tableId])).rows.map(r => r.id);

test("readings 8 days old are deleted, 6 days old are kept", async () => {
  const table = await createTable();
  await addReading(table.id, 8);
  const recent = await addReading(table.id, 6);
  const otherTables = (await query("SELECT COUNT(*)::int AS n FROM incidents")).rows[0].n;

  assert.equal(await cleanupOldReadings(7), 1);
  assert.deepEqual(await readingIds(table.id), [recent]);
  assert.equal((await query("SELECT COUNT(*)::int AS n FROM incidents")).rows[0].n, otherTables, "incidents untouched");
});

test("batching: more than 50,000 old readings are all deleted", async () => {
  const table = await createTable();
  await query(
    `INSERT INTO noise_readings (table_id, db_level, recorded_at)
     SELECT $1, 40, NOW() - INTERVAL '10 days' FROM generate_series(1, 50010)`,
    [table.id]
  );
  const keep = await addReading(table.id, 1);

  assert.equal(await cleanupOldReadings(7), 50010);
  assert.deepEqual(await readingIds(table.id), [keep]);

  // Smaller batches give the same result (several rounds of the loop).
  await query(`INSERT INTO noise_readings (table_id, db_level, recorded_at)
               SELECT $1, 40, NOW() - INTERVAL '10 days' FROM generate_series(1, 25)`, [table.id]);
  assert.equal(await cleanupOldReadings(7, 10), 25);
  assert.deepEqual(await readingIds(table.id), [keep]);
});

test("NOISE_READINGS_RETENTION_DAYS: default 7, custom value, bad values rejected", () => {
  const read = value => {
    const childEnv = { ...process.env, NODE_ENV: "test" };
    if (value === undefined) delete childEnv.NOISE_READINGS_RETENTION_DAYS;
    else childEnv.NOISE_READINGS_RETENTION_DAYS = value;
    // Run from the temp folder so server/.env isn't loaded.
    return execFileSync(process.execPath, ["--input-type=module", "-e", "const { env } = await import(process.argv[1]); console.log(env.noiseReadingsRetentionDays);", new URL("../src/config/env.js", import.meta.url).href], {
      env: childEnv,
      cwd: tmpdir(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  };
  assert.equal(read(undefined), "7");
  assert.equal(read("3"), "3");
  for (const bad of ["0", "-1", "1.5", "abc"]) assert.throws(() => read(bad), undefined, `${bad} must be rejected`);
});

test("incidents older than 30 days lose their occupant; newer ones keep it", async () => {
  const table = await createTable();
  const o = await createOccupant({ email: "unlink@test.local", password: "Password123" });
  const addIncident = daysAgo =>
    query(
      `INSERT INTO incidents (table_id, occupant_id, category, db_level, occurred_at)
       VALUES ($1, $2, 'Loud Conversation', 70, NOW() - make_interval(days => $3)) RETURNING id`,
      [table.id, o.id, daysAgo]
    ).then(r => r.rows[0].id);
  const oldId = await addIncident(31);
  const newId = await addIncident(29);

  const result = await cleanupPersonalData(30);
  assert.equal(result.incidents, 1);
  const rows = (await query("SELECT id, occupant_id FROM incidents WHERE id = ANY($1)", [[oldId, newId]])).rows;
  const byId = Object.fromEntries(rows.map(r => [r.id, r.occupant_id]));
  assert.equal(byId[oldId], null, "31-day-old incident is kept but no longer names the occupant");
  assert.equal(byId[newId], o.id);
});

test("released seat history older than 30 days is deleted; active and recent seats stay", async () => {
  const oldTable = await createTable();
  const recentTable = await createTable();
  const activeTable = await createTable();
  const o1 = await createOccupant({ email: "seat1@test.local", password: "Password123" });
  const o2 = await createOccupant({ email: "seat2@test.local", password: "Password123" });
  const o3 = await createOccupant({ email: "seat3@test.local", password: "Password123" });
  const seat = (tableId, occupantId, assignedDaysAgo, releasedDaysAgo) =>
    query(
      `INSERT INTO table_assignments (table_id, occupant_id, assigned_at, released_at)
       VALUES ($1, $2, NOW() - make_interval(days => $3),
               CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() - make_interval(days => $4::int) END)
       RETURNING id`,
      [tableId, occupantId, assignedDaysAgo, releasedDaysAgo]
    ).then(r => r.rows[0].id);
  const oldSeat = await seat(oldTable.id, o1.id, 40, 31);
  const recentSeat = await seat(recentTable.id, o2.id, 35, 29);
  const activeSeat = await seat(activeTable.id, o3.id, 60, null);

  const result = await cleanupPersonalData(30);
  assert.equal(result.assignments, 1);
  const left = (await query("SELECT id FROM table_assignments WHERE id = ANY($1) ORDER BY id", [[oldSeat, recentSeat, activeSeat]])).rows.map(r => r.id);
  assert.deepEqual(left, [recentSeat, activeSeat], "active seat kept even though it started 60 days ago");
});
