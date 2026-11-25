// Creates the 7 Studify tables (2nd floor, one sensor node per table):
//   table 1..7 -> NODE-001..NODE-007, default thresholds
//   (DEFAULT_WARNING_THRESHOLD / DEFAULT_CRITICAL_THRESHOLD, 68 / 75 dB,
//   provisional until calibration), 10 s confirmation, table 7 PAUSED.
// Nothing else: no accounts, no occupants, no readings, no incidents.
// (`npm run db:seed` is the separate demo seed with fake people and history.)
//
// Optional and safe to re-run: a table whose number or node ID already
// exists is left exactly as it is.
//
//   npm run db:seed:tables
//
import pg from "pg";
import dotenv from "dotenv";
import { pathToFileURL } from "url";
import { pgConfig } from "../src/config/dbConfig.js";
import { readThresholdDefaults } from "../src/config/thresholdDefaults.js";

dotenv.config();

export const STUDIFY_TABLES = [1, 2, 3, 4, 5, 6, 7].map(n => ({
  table_number: n,
  sensor_node_id: `NODE-${String(n).padStart(3, "0")}`,
  description: "Studify Study Hub - 2nd floor",
  status: n === 7 ? "PAUSED" : "AVAILABLE"
}));

/**
 * Inserts the tables that don't exist yet, each with its sensor_status row,
 * in one transaction. Returns how many tables were created.
 */
export async function seedTables(client, { thresholds = readThresholdDefaults(), log = console.log } = {}) {
  let created = 0;
  await client.query("BEGIN");
  try {
    for (const t of STUDIFY_TABLES) {
      const { rows } = await client.query(
        `INSERT INTO tables (table_number, sensor_node_id, description, warning_threshold, critical_threshold, confirmation_seconds, status)
         VALUES ($1, $2, $3, $4, $5, 10, $6)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [t.table_number, t.sensor_node_id, t.description, thresholds.warning, thresholds.critical, t.status]
      );
      if (!rows.length) {
        log(`[seed:tables] Table ${t.table_number} / ${t.sensor_node_id} already exists, left unchanged.`);
        continue;
      }
      await client.query(
        "INSERT INTO sensor_status (table_id, is_online, last_seen) VALUES ($1, FALSE, NULL) ON CONFLICT (table_id) DO NOTHING",
        [rows[0].id]
      );
      created += 1;
      log(`[seed:tables] Created table ${t.table_number} (${t.sensor_node_id}, ${thresholds.warning}/${thresholds.critical} dB, ${t.status}).`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return created;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed:tables] DATABASE_URL is not set.");
    process.exit(1);
  }
  const config = pgConfig();
  const target = new URL(config.connectionString);
  console.log(`[seed:tables] Database: ${target.hostname}${target.pathname}`);

  const client = new pg.Client(config);
  await client.connect();
  try {
    const created = await seedTables(client);
    console.log(`[seed:tables] Done: ${created} table(s) created.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(`[seed:tables] ${err.message}`);
    process.exit(1);
  });
}
