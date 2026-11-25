// 10-second reading rows (services/readingWindows.js, migration 018).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, query, resetDatabase, closeDatabase, createAdmin, createTable, bearer } from "./helpers.js";
import { ingestTelemetry } from "../src/services/telemetryService.js";
import { flushReadings } from "../src/services/readingWindows.js";
import { clearStatsCache } from "../src/services/tablesService.js";

let auth;
before(async () => {
  await resetDatabase();
  auth = bearer((await createAdmin()).token);
});
after(closeDatabase);

test("25 readings over 25 s are stored as 3 rows (10 s windows) with average, peak and count", async () => {
  const table = await createTable({ sensor_node_id: "NODE-WIN" });
  const t0 = Math.floor(Date.now() / 10000) * 10000 - 60000; // a window boundary, a minute ago
  for (let s = 0; s < 25; s++) {
    await ingestTelemetry("NODE-WIN", { db_level: s === 7 ? 70 : 50 }, { now: new Date(t0 + s * 1000) });
  }
  const before = await query("SELECT COUNT(*)::int AS n FROM noise_readings WHERE table_id = $1", [table.id]);
  assert.equal(before.rows[0].n, 2, "the first two windows are written as soon as the next one starts");
  await flushReadings({ all: true });

  const { rows } = await query(
    "SELECT db_level::float AS avg, peak_db::float AS peak, samples FROM noise_readings WHERE table_id = $1 ORDER BY recorded_at",
    [table.id]
  );
  assert.deepEqual(rows, [
    { avg: 52, peak: 70, samples: 10 },
    { avg: 50, peak: 50, samples: 10 },
    { avg: 50, peak: 50, samples: 5 }
  ]);

  // 24 h stats are weighted by samples and use the peak column.
  clearStatsCache();
  const got = await api().get(`/api/tables/${table.id}`).set(auth);
  assert.equal(got.body.table.peak_db, 70);
  assert.equal(got.body.table.avg_db, 50.8);
});

test("an open window is only written once it is over (or on shutdown)", async () => {
  const table = await createTable({ sensor_node_id: "NODE-WIN2" });
  const now = new Date();
  await ingestTelemetry("NODE-WIN2", { db_level: 55 }, { now });
  assert.equal(await flushReadings({ now }), 0);
  assert.equal(await flushReadings({ now: new Date(now.getTime() + 10000) }), 1);
  const { rows } = await query("SELECT samples FROM noise_readings WHERE table_id = $1", [table.id]);
  assert.deepEqual(rows, [{ samples: 1 }]);
});
