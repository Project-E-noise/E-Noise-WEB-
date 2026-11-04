import { query } from "../config/db.js";

export async function activeForTable(tableId) {
  const { rows } = await query(
    "SELECT * FROM table_assignments WHERE table_id = $1 AND released_at IS NULL",
    [tableId]
  );
  return rows[0] || null;
}

export async function activeForOccupant(occupantId) {
  const { rows } = await query(
    "SELECT * FROM table_assignments WHERE occupant_id = $1 AND released_at IS NULL",
    [occupantId]
  );
  return rows[0] || null;
}

export async function create({ table_id, occupant_id }) {
  const { rows } = await query(
    `INSERT INTO table_assignments (table_id, occupant_id, assigned_at) VALUES ($1, $2, NOW()) RETURNING *`,
    [table_id, occupant_id]
  );
  return rows[0];
}

export async function release(id) {
  const { rows } = await query(
    `UPDATE table_assignments SET released_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}
