import { query } from "../config/db.js";

export async function forOccupant(occupantId) {
  const { rows } = await query(
    "SELECT * FROM violations WHERE occupant_id = $1 ORDER BY violation_number ASC",
    [occupantId]
  );
  return rows;
}

export async function countForOccupant(occupantId, client) {
  const runner = client || { query };
  const { rows } = await runner.query("SELECT COUNT(*)::int AS count FROM violations WHERE occupant_id = $1", [occupantId]);
  return rows[0].count;
}

export async function create({ occupant_id, incident_id, table_id, violation_number }, client) {
  const runner = client || { query };
  const { rows } = await runner.query(
    `INSERT INTO violations (occupant_id, incident_id, table_id, violation_number)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [occupant_id, incident_id, table_id, violation_number]
  );
  return rows[0];
}

export async function findAll() {
  const { rows } = await query("SELECT * FROM violations ORDER BY created_at ASC");
  return rows;
}
