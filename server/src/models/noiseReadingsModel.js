import { query } from "../config/db.js";

export async function latestForTable(tableId) {
  const { rows } = await query(
    "SELECT * FROM noise_readings WHERE table_id = $1 ORDER BY recorded_at DESC LIMIT 1",
    [tableId]
  );
  return rows[0] || null;
}

/** Average and peak dB for one table over the last 24 hours. */
export async function statsForTable(tableId) {
  const { rows } = await query(
    `SELECT AVG(db_level)::float AS avg_db, MAX(db_level)::float AS peak_db
     FROM noise_readings
     WHERE table_id = $1 AND recorded_at >= NOW() - INTERVAL '24 hours'`,
    [tableId]
  );
  return { avg_db: rows[0].avg_db, peak_db: rows[0].peak_db };
}

/**
 * Readings for one table. With group = "minute" or "hour", readings are
 * averaged per minute/hour (a sensor sends one reading per second, so a
 * full day is 86,400 rows, far too many for a chart).
 */
export async function forTable(tableId, { from, to, group, limit = 5000 } = {}) {
  if (group === "minute" || group === "hour") {
    const { rows } = await query(
      `SELECT date_trunc($4, recorded_at) AS recorded_at,
              ROUND(AVG(db_level), 2)::float AS db_level,
              MAX(db_level)::float AS peak_db,
              COUNT(*)::int AS samples
       FROM noise_readings
       WHERE table_id = $1
         AND ($2::timestamptz IS NULL OR recorded_at >= $2)
         AND ($3::timestamptz IS NULL OR recorded_at < $3)
       GROUP BY 1 ORDER BY 1 ASC LIMIT $5`,
      [tableId, from ?? null, to ?? null, group, limit]
    );
    return rows;
  }
  // Raw rows: newest `limit` readings in the window, returned oldest first.
  const { rows } = await query(
    `SELECT * FROM (
       SELECT id, table_id, db_level::float AS db_level, classification, confidence::float AS confidence, recorded_at
       FROM noise_readings
       WHERE table_id = $1
         AND ($2::timestamptz IS NULL OR recorded_at >= $2)
         AND ($3::timestamptz IS NULL OR recorded_at < $3)
       ORDER BY recorded_at DESC LIMIT $4
     ) recent ORDER BY recorded_at ASC`,
    [tableId, from ?? null, to ?? null, limit]
  );
  return rows;
}

/** For CSV/JSON export. Optional time window and table filter. */
export async function findForExport({ from, to, table_id } = {}) {
  const { rows } = await query(
    `SELECT r.id, r.table_id, t.table_number, r.db_level, r.classification, r.confidence, r.recorded_at
     FROM noise_readings r JOIN tables t ON t.id = r.table_id
     WHERE ($1::timestamptz IS NULL OR r.recorded_at >= $1)
       AND ($2::timestamptz IS NULL OR r.recorded_at < $2)
       AND ($3::int IS NULL OR r.table_id = $3)
     ORDER BY r.recorded_at ASC`,
    [from ?? null, to ?? null, table_id ?? null]
  );
  return rows;
}

/** Overall average dB in a time window (one number, computed by Postgres). */
export async function averageDb({ from, to } = {}) {
  const { rows } = await query(
    `SELECT AVG(db_level)::float AS avg_db FROM noise_readings
     WHERE ($1::timestamptz IS NULL OR recorded_at >= $1)
       AND ($2::timestamptz IS NULL OR recorded_at < $2)`,
    [from ?? null, to ?? null]
  );
  return rows[0].avg_db;
}

/**
 * Average dB per table per hour (or per day), for the analytics trend
 * chart. Buckets are labelled in timezone `tz`.
 */
export async function trendAverages({ from, to, tz = "UTC", bucket = "hour" } = {}) {
  const format = bucket === "day" ? "YYYY-MM-DD" : "YYYY-MM-DD HH24:00";
  const { rows } = await query(
    `SELECT table_id,
            TO_CHAR(date_trunc($4, recorded_at AT TIME ZONE $3), $5) AS bucket,
            ROUND(AVG(db_level), 1)::float AS avg_db
     FROM noise_readings
     WHERE ($1::timestamptz IS NULL OR recorded_at >= $1)
       AND ($2::timestamptz IS NULL OR recorded_at < $2)
     GROUP BY table_id, bucket
     ORDER BY bucket ASC`,
    [from ?? null, to ?? null, tz, bucket === "day" ? "day" : "hour", format]
  );
  return rows;
}

export async function create({ table_id, db_level, classification, confidence, recorded_at }) {
  const { rows } = await query(
    `INSERT INTO noise_readings (table_id, db_level, classification, confidence, recorded_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [table_id, db_level, classification, confidence, recorded_at || new Date().toISOString()]
  );
  return rows[0];
}
