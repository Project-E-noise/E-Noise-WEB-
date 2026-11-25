import { query } from "../config/db.js";

// Since migration 018 a row covers up to 10 s of one table's readings
// (services/readingWindows.js): db_level = their average, peak_db = the
// loudest, samples = how many. Older rows are single readings (samples 1,
// peak_db empty). So averages are weighted by samples and peaks use
// COALESCE(peak_db, db_level); for single-reading rows that is the same as
// before.
const WEIGHTED_AVG = "SUM(db_level * samples) / NULLIF(SUM(samples), 0)";
const PEAK = "MAX(COALESCE(peak_db, db_level))";

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
    `SELECT (${WEIGHTED_AVG})::float AS avg_db, ${PEAK}::float AS peak_db
     FROM noise_readings
     WHERE table_id = $1 AND recorded_at >= NOW() - INTERVAL '24 hours'`,
    [tableId]
  );
  return { avg_db: rows[0].avg_db, peak_db: rows[0].peak_db };
}

/**
 * Readings for one table. With group = "minute" or "hour", rows are
 * averaged per minute/hour (a day is 8,640 ten-second rows per table, too
 * many for a chart).
 */
export async function forTable(tableId, { from, to, group, limit = 5000 } = {}) {
  if (group === "minute" || group === "hour") {
    const { rows } = await query(
      `SELECT date_trunc($4, recorded_at) AS recorded_at,
              ROUND(${WEIGHTED_AVG}, 2)::float AS db_level,
              ${PEAK}::float AS peak_db,
              SUM(samples)::int AS samples
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
       SELECT id, table_id, db_level::float AS db_level, COALESCE(peak_db, db_level)::float AS peak_db, samples,
              classification, confidence::float AS confidence, recorded_at
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
    `SELECT r.id, r.table_id, t.table_number, r.db_level, COALESCE(r.peak_db, r.db_level) AS peak_db, r.samples,
            r.classification, r.confidence, r.recorded_at
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
    `SELECT (${WEIGHTED_AVG})::float AS avg_db FROM noise_readings
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
            ROUND(${WEIGHTED_AVG}, 1)::float AS avg_db
     FROM noise_readings
     WHERE ($1::timestamptz IS NULL OR recorded_at >= $1)
       AND ($2::timestamptz IS NULL OR recorded_at < $2)
     GROUP BY table_id, bucket
     ORDER BY bucket ASC`,
    [from ?? null, to ?? null, tz, bucket === "day" ? "day" : "hour", format]
  );
  return rows;
}

// Deletes up to `batchSize` readings older than `days` days. Returns how
// many were deleted; call it again until it returns 0. Small batches keep
// each DELETE short, so inserts from the sensors are never blocked for long.
export async function deleteOlderThanBatch(days, batchSize = 50000) {
  const { rowCount } = await query(
    `DELETE FROM noise_readings WHERE id IN (
       SELECT id FROM noise_readings
       WHERE recorded_at < NOW() - make_interval(days => $1)
       LIMIT $2)`,
    [days, batchSize]
  );
  return rowCount;
}

/** One 10-second window of a table's readings (services/readingWindows.js). */
export async function createWindow({ table_id, db_level, peak_db, samples, classification, confidence, recorded_at }) {
  const { rows } = await query(
    `INSERT INTO noise_readings (table_id, db_level, peak_db, samples, classification, confidence, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [table_id, db_level, peak_db, samples, classification, confidence, recorded_at]
  );
  return rows[0];
}
