import { query } from "../config/db.js";

export async function latestForTable(tableId) {
  const { rows } = await query(
    "SELECT * FROM noise_readings WHERE table_id = $1 ORDER BY recorded_at DESC LIMIT 1",
    [tableId]
  );
  return rows[0] || null;
}

export async function statsForTable(tableId) {
  const { rows } = await query(
    "SELECT AVG(db_level)::float AS avg_db, MAX(db_level)::float AS peak_db FROM noise_readings WHERE table_id = $1",
    [tableId]
  );
  return { avg_db: rows[0].avg_db, peak_db: rows[0].peak_db };
}

export async function forTable(tableId, { from, to } = {}) {
  const { rows } = await query(
    `SELECT * FROM noise_readings
     WHERE table_id = $1
       AND ($2::timestamptz IS NULL OR recorded_at >= $2)
       AND ($3::timestamptz IS NULL OR recorded_at <= $3)
     ORDER BY recorded_at ASC`,
    [tableId, from || null, to || null]
  );
  return rows;
}

export async function findAll({ from, to } = {}) {
  const { rows } = await query(
    `SELECT * FROM noise_readings
     WHERE ($1::timestamptz IS NULL OR recorded_at >= $1)
       AND ($2::timestamptz IS NULL OR recorded_at <= $2)
     ORDER BY recorded_at ASC`,
    [from || null, to || null]
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
