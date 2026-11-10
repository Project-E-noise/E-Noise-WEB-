// "Sensors online": a sensor only counts as online if it said so AND
// reported recently (SENSOR_STALE_SECONDS, default 60), plus the sweep that
// marks silent sensors offline.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, bearer, query } from "./helpers.js";
import * as sensorStatusModel from "../src/models/sensorStatusModel.js";
import { sweepStaleSensors } from "../src/services/telemetryService.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

// Puts a table's sensor_status into a given state. `secondsAgo` null = never seen.
async function setSensor(tableId, isOnline, secondsAgo) {
  await query(
    `UPDATE sensor_status
     SET is_online = $2, last_seen = CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() - make_interval(secs => $3::int) END
     WHERE table_id = $1`,
    [tableId, isOnline, secondsAgo]
  );
}

const onlineFromApi = async tableId => (await api().get(`/api/tables/${tableId}`).set(auth)).body.table.is_online;

test("effective online = is_online AND last_seen within the window", async () => {
  const cases = [
    { isOnline: true, secondsAgo: 0, expected: true, why: "just reported" },
    { isOnline: true, secondsAgo: 120, expected: false, why: "silent for 120 s (window 60)" },
    { isOnline: true, secondsAgo: null, expected: false, why: "never reported" },
    { isOnline: false, secondsAgo: 0, expected: false, why: "device said offline" }
  ];
  for (const c of cases) {
    const table = await createTable();
    await setSensor(table.id, c.isOnline, c.secondsAgo);
    assert.equal((await sensorStatusModel.findByTableId(table.id, 60)).effective_online, c.expected, c.why);
    assert.equal(await onlineFromApi(table.id), c.expected, `API: ${c.why}`);
  }
});

test("the list endpoint uses the same rule", async () => {
  const fresh = await createTable();
  const stale = await createTable();
  await setSensor(fresh.id, true, 0);
  await setSensor(stale.id, true, 3 * 86400);
  const { body } = await api().get("/api/tables").set(auth);
  const byId = Object.fromEntries(body.tables.map(t => [t.id, t]));
  assert.equal(byId[fresh.id].is_online, true);
  assert.equal(byId[stale.id].is_online, false);
  assert.equal(byId[stale.id].sensor_status.is_online, false);
});

test("the sweep flips stale rows to offline and returns their table ids", async () => {
  await query("UPDATE sensor_status SET is_online = FALSE");
  const fresh = await createTable();
  const stale = await createTable();
  const neverSeen = await createTable();
  await setSensor(fresh.id, true, 0);
  await setSensor(stale.id, true, 120);
  await setSensor(neverSeen.id, true, null);

  const changed = await sweepStaleSensors(60);
  assert.deepEqual([...changed].sort((a, b) => a - b), [stale.id, neverSeen.id].sort((a, b) => a - b));

  const rows = (await query("SELECT table_id, is_online FROM sensor_status WHERE table_id = ANY($1)", [[fresh.id, stale.id, neverSeen.id]])).rows;
  const stored = Object.fromEntries(rows.map(r => [r.table_id, r.is_online]));
  assert.deepEqual(stored, { [fresh.id]: true, [stale.id]: false, [neverSeen.id]: false });

  assert.deepEqual(await sweepStaleSensors(60), [], "a second sweep has nothing to do");
});

test("the window size is respected", async () => {
  const table = await createTable();
  await setSensor(table.id, true, 90);
  assert.equal((await sensorStatusModel.findByTableId(table.id, 60)).effective_online, false);
  assert.equal((await sensorStatusModel.findByTableId(table.id, 120)).effective_online, true);
  assert.deepEqual(await sensorStatusModel.markStaleOffline(120), []);
  assert.deepEqual(await sensorStatusModel.markStaleOffline(60), [table.id]);
});

test("SENSOR_STALE_SECONDS: default 60, custom value, bad values rejected", () => {
  const read = value => {
    const childEnv = { ...process.env, NODE_ENV: "test" };
    if (value === undefined) delete childEnv.SENSOR_STALE_SECONDS;
    else childEnv.SENSOR_STALE_SECONDS = value;
    // Run from the temp folder so server/.env isn't loaded.
    return execFileSync(process.execPath, ["--input-type=module", "-e", "const { env } = await import(process.argv[1]); console.log(env.sensorStaleSeconds);", new URL("../src/config/env.js", import.meta.url).href], {
      env: childEnv,
      cwd: tmpdir(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  };
  assert.equal(read(undefined), "60");
  assert.equal(read("90"), "90");
  for (const bad of ["0", "-5", "1.5", "abc"]) assert.throws(() => read(bad), undefined, `${bad} must be rejected`);
});
