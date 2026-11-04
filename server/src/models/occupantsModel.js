import { query } from "../config/db.js";

export async function findAll({ q } = {}) {
  const term = (q || "").trim();
  const { rows } = await query(
    `SELECT * FROM occupants WHERE $1 = '' OR full_name ILIKE '%' || $1 || '%' ORDER BY full_name ASC`,
    [term]
  );
  return rows;
}

export async function findById(id) {
  const { rows } = await query("SELECT * FROM occupants WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function create({ full_name }) {
  const { rows } = await query(
    `INSERT INTO occupants (full_name, status) VALUES ($1, 'ACTIVE') RETURNING *`,
    [full_name]
  );
  return rows[0];
}

export async function update(id, { full_name, status }) {
  const { rows } = await query(
    `UPDATE occupants
     SET full_name = COALESCE($2, full_name), status = COALESCE($3, status), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, full_name ?? null, status ?? null]
  );
  return rows[0];
}

export async function remove(id) {
  const { rowCount } = await query("DELETE FROM occupants WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function ban(id, { ban_started_at, ban_until }) {
  const { rows } = await query(
    `UPDATE occupants SET status = 'BANNED', ban_started_at = $2, ban_until = $3, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, ban_started_at, ban_until]
  );
  return rows[0];
}

export async function violationCount(occupantId) {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM violations WHERE occupant_id = $1", [occupantId]);
  return rows[0].count;
}
