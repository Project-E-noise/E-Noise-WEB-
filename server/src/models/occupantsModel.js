import { query, runnerFor } from "../config/db.js";

// A ban ends by itself once ban_until has passed. Every read uses this
// expression as `status`, so an ended ban reads as ACTIVE even though the
// stored column still says BANNED (nothing reads the stored value directly).
export const EFFECTIVE_STATUS = "CASE WHEN status = 'BANNED' AND ban_until <= NOW() THEN 'ACTIVE' ELSE status END";
// account_ready: the occupant verified their email and set a password, so
// they finished signing up themselves (required before being seated).
const COLUMNS = `id, full_name, email, contact, ${EFFECTIVE_STATUS} AS status, ban_started_at, ban_until,
  strikes_since, ban_strikes_since, (email_verified AND password_hash IS NOT NULL) AS account_ready, consented_at, created_at, updated_at`;

export async function findAll({ q } = {}) {
  // Escape % and _ so a search for "50%" means the text "50%".
  const term = (q || "").trim().replace(/[\\%_]/g, ch => `\\${ch}`);
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM occupants
     WHERE $1 = '' OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%'
     ORDER BY full_name ASC`,
    [term]
  );
  return rows;
}

export async function findById(id, client) {
  const { rows } = await runnerFor(client).query(`SELECT ${COLUMNS} FROM occupants WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Same as findById but locks the row until the transaction ends, so only
 * one transaction at a time can add violations for this occupant.
 * NO KEY UPDATE (not plain UPDATE) so it doesn't block foreign-key checks.
 */
export async function findByIdForUpdate(id, client) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM occupants WHERE id = $1 FOR NO KEY UPDATE`, [id]);
  return rows[0] || null;
}

// Admins can't change an occupant's email: it is the occupant's login.
export async function update(id, { full_name, contact }) {
  const { rows } = await query(
    `UPDATE occupants
     SET full_name = COALESCE($2, full_name),
         contact = COALESCE($3, contact),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, full_name ?? null, contact ?? null]
  );
  return rows[0] || null;
}

export async function remove(id) {
  const { rowCount } = await query("DELETE FROM occupants WHERE id = $1", [id]);
  return rowCount > 0;
}

/**
 * Starts a ban of `days` days and resets strikes: only violations created
 * after this moment count as new strikes. The old strikes_since is kept in
 * ban_strikes_since so the ban can be recounted later. Uses the database
 * clock (clock_timestamp, like violations.created_at) so the two line up.
 */
export async function ban(id, days, client) {
  const { rows } = await runnerFor(client).query(
    `UPDATE occupants
     SET status = 'BANNED', ban_started_at = clock_timestamp(), ban_until = clock_timestamp() + make_interval(days => $2),
         ban_strikes_since = strikes_since, strikes_since = clock_timestamp(), updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, days]
  );
  return rows[0];
}

/** An admin ends a ban early. ban_until becomes now so the history stays correct. */
export async function liftBan(id) {
  const { rows } = await query(
    `UPDATE occupants
     SET status = 'ACTIVE', ban_until = GREATEST(NOW(), ban_started_at + INTERVAL '1 second'), updated_at = NOW()
     WHERE id = $1 AND status = 'BANNED'
     RETURNING ${COLUMNS}`,
    [id]
  );
  return rows[0] || null;
}

/**
 * A strike behind the current ban was removed and the recount is below the
 * threshold: end the ban now and give back the strikes that are left
 * (strikes_since goes back to where it was before the ban).
 */
export async function liftBanAfterRecount(id, client) {
  const { rows } = await runnerFor(client).query(
    `UPDATE occupants
     SET status = 'ACTIVE', ban_until = GREATEST(clock_timestamp(), ban_started_at + INTERVAL '1 second'),
         strikes_since = ban_strikes_since, ban_strikes_since = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'BANNED'
     RETURNING ${COLUMNS}`,
    [id]
  );
  return rows[0] || null;
}

/** All violations ever (history). */
export async function violationCount(occupantId) {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM violations WHERE occupant_id = $1", [occupantId]);
  return rows[0].count;
}
