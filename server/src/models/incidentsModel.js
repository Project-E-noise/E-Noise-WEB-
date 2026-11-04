import { query } from "../config/db.js";

export async function findAll({ table_id, since } = {}) {
  const { rows } = await query(
    `SELECT * FROM incidents
     WHERE ($1::int IS NULL OR table_id = $1)
       AND ($2::timestamptz IS NULL OR occurred_at >= $2)
     ORDER BY occurred_at DESC`,
    [table_id ?? null, since ?? null]
  );
  return rows;
}

export async function findById(id) {
  const { rows } = await query("SELECT * FROM incidents WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function forTable(tableId) {
  const { rows } = await query("SELECT * FROM incidents WHERE table_id = $1 ORDER BY occurred_at DESC", [tableId]);
  return rows;
}

export async function lastForTable(tableId) {
  const { rows } = await query(
    "SELECT occurred_at FROM incidents WHERE table_id = $1 ORDER BY occurred_at DESC LIMIT 1",
    [tableId]
  );
  return rows[0]?.occurred_at || null;
}

export async function create(
  { table_id, occupant_id, category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at },
  client
) {
  const runner = client || { query };
  const { rows } = await runner.query(
    `INSERT INTO incidents (table_id, occupant_id, category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [table_id, occupant_id, category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at]
  );
  return rows[0];
}

export async function update(id, { category, db_level, confidence, duration_seconds, bulb_triggered, status, notes }) {
  const { rows } = await query(
    `UPDATE incidents
     SET category = COALESCE($2, category),
         db_level = COALESCE($3, db_level),
         confidence = COALESCE($4, confidence),
         duration_seconds = COALESCE($5, duration_seconds),
         bulb_triggered = COALESCE($6, bulb_triggered),
         status = COALESCE($7, status),
         notes = COALESCE($8, notes)
     WHERE id = $1
     RETURNING *`,
    [id, category ?? null, db_level ?? null, confidence ?? null, duration_seconds ?? null, bulb_triggered ?? null, status ?? null, notes ?? null]
  );
  return rows[0];
}

export async function remove(id) {
  const { rowCount } = await query("DELETE FROM incidents WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function categoryBreakdown({ since, to } = {}) {
  const { rows } = await query(
    `SELECT category, COUNT(*)::int AS count FROM incidents
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR occurred_at <= $2)
     GROUP BY category`,
    [since || null, to || null]
  );
  return rows;
}

export async function dailyBreakdown({ since, to } = {}) {
  const { rows } = await query(
    `SELECT TO_CHAR(occurred_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
     FROM incidents
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR occurred_at <= $2)
     GROUP BY day ORDER BY day ASC`,
    [since || null, to || null]
  );
  return rows;
}

export async function mostAffectedTable({ since, to } = {}) {
  const { rows } = await query(
    `SELECT table_id, COUNT(*)::int AS count FROM incidents
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR occurred_at <= $2)
     GROUP BY table_id ORDER BY count DESC LIMIT 1`,
    [since || null, to || null]
  );
  return rows[0] || null;
}

export async function totalCount({ since, to } = {}) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM incidents
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR occurred_at <= $2)`,
    [since || null, to || null]
  );
  return rows[0].count;
}
