import { query } from "../config/db.js";

export async function findAll({ q } = {}) {
  const term = (q || "").trim();
  const { rows } = await query(
    `SELECT id, full_name, email, contact, status, ban_started_at, ban_until, created_at, updated_at FROM occupants WHERE $1 = '' OR full_name ILIKE '%' || $1 || '%' ORDER BY full_name ASC`,
    [term]
  );
  return rows;
}

export async function findById(id) {
  const { rows } = await query("SELECT id, full_name, email, contact, status, ban_started_at, ban_until, created_at, updated_at FROM occupants WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function findByEmail(email) {
  const { rows } = await query("SELECT id, full_name, email, contact, status, ban_started_at, ban_until, created_at, updated_at FROM occupants WHERE LOWER(email)=LOWER($1)", [email]);
  return rows[0] || null;
}

export async function create({ full_name, email, contact }) {
  const { rows } = await query(
    `INSERT INTO occupants (full_name, email, contact, status) VALUES ($1, $2, $3, 'ACTIVE') RETURNING id, full_name, email, contact, status, ban_started_at, ban_until, created_at, updated_at`,
    [full_name, email || null, contact || '']
  );
  return rows[0];
}

export async function update(id, { full_name, status, email, contact }) {
  const { rows } = await query(
    `UPDATE occupants
     SET full_name = COALESCE($2, full_name), status = COALESCE($3, status), email = CASE WHEN $4 THEN $5 ELSE email END, contact = COALESCE($6, contact), updated_at = NOW()
     WHERE id = $1
     RETURNING id, full_name, email, contact, status, ban_started_at, ban_until, created_at, updated_at`,
    [id, full_name ?? null, status ?? null, email !== undefined, email ?? null, contact ?? null]
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
     WHERE id = $1 RETURNING id, full_name, email, contact, status, ban_started_at, ban_until, created_at, updated_at`,
    [id, ban_started_at, ban_until]
  );
  return rows[0];
}

export async function violationCount(occupantId) {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM violations WHERE occupant_id = $1", [occupantId]);
  return rows[0].count;
}
