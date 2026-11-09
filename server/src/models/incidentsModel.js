import { query } from "../config/db.js";

function runnerFor(client) {
  return client || { query };
}

// Incidents joined with their table number and occupant name, so the API
// doesn't need extra queries per row.
const SELECT_WITH_NAMES = `
  SELECT i.*, t.table_number, o.full_name AS occupant_name
  FROM incidents i
  JOIN tables t ON t.id = i.table_id
  LEFT JOIN occupants o ON o.id = i.occupant_id`;

export async function findAll({ table_id, from, to } = {}) {
  const { rows } = await query(
    `${SELECT_WITH_NAMES}
     WHERE ($1::int IS NULL OR i.table_id = $1)
       AND ($2::timestamptz IS NULL OR i.occurred_at >= $2)
       AND ($3::timestamptz IS NULL OR i.occurred_at < $3)
     ORDER BY i.occurred_at DESC`,
    [table_id ?? null, from ?? null, to ?? null]
  );
  return rows;
}

export async function findById(id, client) {
  const { rows } = await runnerFor(client).query(`${SELECT_WITH_NAMES} WHERE i.id = $1`, [id]);
  return rows[0] || null;
}

export async function forTable(tableId) {
  const { rows } = await query(`${SELECT_WITH_NAMES} WHERE i.table_id = $1 ORDER BY i.occurred_at DESC`, [tableId]);
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
  const { rows } = await runnerFor(client).query(
    `INSERT INTO incidents (table_id, occupant_id, category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [table_id, occupant_id, category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at]
  );
  return rows[0];
}

// Only the fields that were given are changed (undefined = keep current value).
export async function update(id, { category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at }, client) {
  const { rows } = await runnerFor(client).query(
    `UPDATE incidents
     SET category = COALESCE($2, category),
         db_level = COALESCE($3, db_level),
         confidence = CASE WHEN $4 THEN $5 ELSE confidence END,
         duration_seconds = CASE WHEN $6 THEN $7 ELSE duration_seconds END,
         bulb_triggered = COALESCE($8, bulb_triggered),
         status = COALESCE($9, status),
         notes = COALESCE($10, notes),
         occurred_at = COALESCE($11, occurred_at)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      category ?? null,
      db_level ?? null,
      confidence !== undefined, confidence ?? null,
      duration_seconds !== undefined, duration_seconds ?? null,
      bulb_triggered ?? null,
      status ?? null,
      notes ?? null,
      occurred_at ?? null
    ]
  );
  return rows[0];
}

export async function remove(id) {
  const { rowCount } = await query("DELETE FROM incidents WHERE id = $1", [id]);
  return rowCount > 0;
}

// ---- Analytics -------------------------------------------------------

export async function categoryBreakdown({ from, to } = {}) {
  const { rows } = await query(
    `SELECT category, COUNT(*)::int AS count FROM incidents
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR occurred_at < $2)
     GROUP BY category`,
    [from ?? null, to ?? null]
  );
  return rows;
}

/** Incidents per day, where "day" is the calendar day in timezone `tz`. */
export async function dailyBreakdown({ from, to, tz = "UTC" } = {}) {
  const { rows } = await query(
    `SELECT TO_CHAR(occurred_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
     FROM incidents
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR occurred_at < $2)
     GROUP BY day ORDER BY day ASC`,
    [from ?? null, to ?? null, tz]
  );
  return rows;
}

export async function mostAffectedTable({ from, to } = {}) {
  const { rows } = await query(
    `SELECT i.table_id, t.table_number, COUNT(*)::int AS count
     FROM incidents i JOIN tables t ON t.id = i.table_id
     WHERE ($1::timestamptz IS NULL OR i.occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR i.occurred_at < $2)
     GROUP BY i.table_id, t.table_number ORDER BY count DESC, t.table_number ASC LIMIT 1`,
    [from ?? null, to ?? null]
  );
  return rows[0] || null;
}

export async function totalCount({ from, to } = {}) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM incidents
     WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR occurred_at < $2)`,
    [from ?? null, to ?? null]
  );
  return rows[0].count;
}
