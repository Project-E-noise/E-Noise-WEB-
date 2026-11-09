import { query } from "../config/db.js";

function runnerFor(client) {
  return client || { query };
}

export async function activeForTable(tableId, client) {
  const { rows } = await runnerFor(client).query(
    "SELECT * FROM table_assignments WHERE table_id = $1 AND released_at IS NULL",
    [tableId]
  );
  return rows[0] || null;
}

export async function activeForOccupant(occupantId, client) {
  const { rows } = await runnerFor(client).query(
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

export async function release(id, client) {
  const { rows } = await runnerFor(client).query(
    `UPDATE table_assignments SET released_at = NOW() WHERE id = $1 AND released_at IS NULL RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

/** Ends whatever table the occupant is sitting at (used when they get banned). */
export async function releaseForOccupant(occupantId, client) {
  const { rows } = await runnerFor(client).query(
    `UPDATE table_assignments SET released_at = NOW() WHERE occupant_id = $1 AND released_at IS NULL RETURNING *`,
    [occupantId]
  );
  return rows[0] || null;
}
