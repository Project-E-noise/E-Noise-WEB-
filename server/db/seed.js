// Seeds the database with the same starter data the old in-memory store
// used to generate at boot. Safe to re-run: skips seeding if any tables
// already exist.
//
//   npm run db:seed
//
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed] DATABASE_URL is not set. Copy server/.env.example to server/.env and set it first.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: existing } = await client.query("SELECT COUNT(*)::int AS count FROM tables");
    if (existing[0].count > 0) {
      console.log("[seed] tables already has data — skipping (delete rows first if you want to reseed).");
      return;
    }

    await client.query("BEGIN");

    const tableIds = [];
    for (let i = 1; i <= 7; i += 1) {
      const { rows } = await client.query(
        `INSERT INTO tables (table_number, sensor_node_id, description, warning_threshold, critical_threshold, confirmation_seconds, status)
         VALUES ($1, $2, $3, 50, 60, 10, 'AVAILABLE')
         RETURNING id`,
        [i, `NODE-00${i}`, "Studify Study Hub - 2nd floor"]
      );
      const tableId = rows[0].id;
      tableIds.push(tableId);

      await client.query(`INSERT INTO sensor_status (table_id, is_online, last_seen) VALUES ($1, TRUE, NOW())`, [tableId]);

      const base = 38 + i;
      for (let h = 0; h < 12; h += 1) {
        const dbLevel = Math.round((base + Math.sin(h / 2) * 6) * 10) / 10;
        const recordedAt = new Date(Date.now() - (12 - h) * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO noise_readings (table_id, db_level, classification, confidence, recorded_at)
           VALUES ($1, $2, 'Ambient Baseline', 0.9, $3)`,
          [tableId, dbLevel, recordedAt.toISOString()]
        );
      }
    }

    const { rows: occupantRows } = await client.query(
      `INSERT INTO occupants (full_name, status) VALUES ('Juan Dela Cruz', 'ACTIVE') RETURNING id`
    );
    const occupantId = occupantRows[0].id;
    const table4Id = tableIds[3];

    await client.query(
      `INSERT INTO table_assignments (table_id, occupant_id, assigned_at) VALUES ($1, $2, NOW())`,
      [table4Id, occupantId]
    );

    const { rows: incidentRows } = await client.query(
      `INSERT INTO incidents (table_id, occupant_id, category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at)
       VALUES ($1, $2, 'Loud Conversation', 58.4, 0.87, 12, TRUE, 'CONFIRMED', '', NOW())
       RETURNING id`,
      [table4Id, occupantId]
    );
    const incidentId = incidentRows[0].id;

    await client.query(
      `INSERT INTO violations (occupant_id, incident_id, table_id, violation_number) VALUES ($1, $2, $3, 1)`,
      [occupantId, incidentId, table4Id]
    );

    await client.query("COMMIT");
    console.log("[seed] Done: 7 tables, seeded readings, 1 occupant, 1 incident, 1 violation.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
