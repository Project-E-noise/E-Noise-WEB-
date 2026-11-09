import { query } from "../config/db.js";

function runnerFor(client) {
  return client || { query };
}

export async function forOccupant(occupantId) {
  const { rows } = await query(
    `SELECT v.*, t.table_number, i.category, i.db_level
     FROM violations v
     JOIN tables t ON t.id = v.table_id
     LEFT JOIN incidents i ON i.id = v.incident_id
     WHERE v.occupant_id = $1
     ORDER BY v.violation_number ASC`,
    [occupantId]
  );
  return rows;
}

/**
 * Strikes = the occupant's violations created after their strikes_since
 * (all of them if it is empty). Done in SQL so the timestamps keep their
 * full precision.
 */
export async function countStrikes(occupantId, client) {
  const { rows } = await runnerFor(client).query(
    `SELECT COUNT(*)::int AS count
     FROM violations v JOIN occupants o ON o.id = v.occupant_id
     WHERE v.occupant_id = $1 AND (o.strikes_since IS NULL OR v.created_at > o.strikes_since)`,
    [occupantId]
  );
  return rows[0].count;
}

/** Next lifetime violation number for an occupant (1, 2, 3, ...). */
export async function nextNumber(occupantId, client) {
  const { rows } = await runnerFor(client).query(
    "SELECT COALESCE(MAX(violation_number), 0)::int + 1 AS next FROM violations WHERE occupant_id = $1",
    [occupantId]
  );
  return rows[0].next;
}

export async function findByIncident(incidentId, client) {
  const { rows } = await runnerFor(client).query("SELECT * FROM violations WHERE incident_id = $1", [incidentId]);
  return rows[0] || null;
}

export async function create({ occupant_id, incident_id, table_id, violation_number }, client) {
  const { rows } = await runnerFor(client).query(
    // clock_timestamp() is the real time of this insert (NOW() would be the
    // start of the transaction), so violations are ordered as they happened.
    `INSERT INTO violations (occupant_id, incident_id, table_id, violation_number, created_at)
     VALUES ($1, $2, $3, $4, clock_timestamp())
     RETURNING *`,
    [occupant_id, incident_id, table_id, violation_number]
  );
  return rows[0];
}

export async function removeForIncident(incidentId, client) {
  const { rowCount } = await runnerFor(client).query("DELETE FROM violations WHERE incident_id = $1", [incidentId]);
  return rowCount > 0;
}

export async function findAll({ from, to, table_id } = {}) {
  const { rows } = await query(
    `SELECT v.*, o.full_name AS occupant_name, t.table_number
     FROM violations v
     JOIN occupants o ON o.id = v.occupant_id
     JOIN tables t ON t.id = v.table_id
     WHERE ($1::timestamptz IS NULL OR v.created_at >= $1)
       AND ($2::timestamptz IS NULL OR v.created_at < $2)
       AND ($3::int IS NULL OR v.table_id = $3)
     ORDER BY v.created_at ASC`,
    [from ?? null, to ?? null, table_id ?? null]
  );
  return rows;
}
