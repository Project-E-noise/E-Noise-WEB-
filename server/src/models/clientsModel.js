import { query } from "../config/db.js";

const CREDENTIAL_COLUMNS = `id, full_name, email, contact, password_hash, email_verified, is_active,
  verification_token, verification_token_expires_at, status, ban_until, created_at`;

export function publicClient(occupant) {
  return {
    full_name: occupant.full_name,
    email: occupant.email,
    contact: occupant.contact || "",
    status: occupant.status,
    email_verified: occupant.email_verified,
    ban_until: occupant.ban_until,
    created_at: occupant.created_at
  };
}

export async function findByEmail(email) {
  const { rows } = await query(`SELECT ${CREDENTIAL_COLUMNS} FROM occupants WHERE LOWER(email) = LOWER($1)`, [email]);
  return rows[0] || null;
}

export async function findById(id) {
  const { rows } = await query(`SELECT ${CREDENTIAL_COLUMNS} FROM occupants WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function createPending({ full_name, email, contact, verification_token, verification_token_expires_at }) {
  const { rows } = await query(
    `INSERT INTO occupants(full_name,email,contact,password_hash,email_verified,is_active,verification_token,verification_token_expires_at)
     VALUES($1,$2,$3,NULL,FALSE,TRUE,$4,$5) RETURNING ${CREDENTIAL_COLUMNS}`,
    [full_name, email, contact, verification_token, verification_token_expires_at]
  );
  return rows[0] || null;
}

export async function updateVerification(id, { verification_token, verification_token_expires_at }) {
  const { rows } = await query(
    `UPDATE occupants SET verification_token=$2, verification_token_expires_at=$3, updated_at=NOW()
     WHERE id=$1 RETURNING ${CREDENTIAL_COLUMNS}`,
    [id, verification_token, verification_token_expires_at]
  );
  return rows[0] || null;
}

export async function byVerificationToken(token) {
  const { rows } = await query(`SELECT ${CREDENTIAL_COLUMNS} FROM occupants WHERE verification_token=$1`, [token]);
  return rows[0] || null;
}

export async function setPasswordForToken(token, password_hash) {
  const { rows } = await query(
    `UPDATE occupants
     SET password_hash=$2, email_verified=TRUE, verification_token=NULL,
         verification_token_expires_at=NULL, updated_at=NOW()
     WHERE verification_token=$1 AND verification_token_expires_at > NOW()
       AND (email_verified=FALSE OR password_hash IS NULL)
     RETURNING id`,
    [token, password_hash]
  );
  return rows[0] || null;
}

export async function update(id, { full_name, contact, password_hash }) {
  const { rows } = await query(
    `UPDATE occupants SET full_name=$2, contact=$3, password_hash=COALESCE($4,password_hash), updated_at=NOW()
     WHERE id=$1 RETURNING ${CREDENTIAL_COLUMNS}`,
    [id, full_name, contact, password_hash ?? null]
  );
  return rows[0] || null;
}

export async function logs(id, { from, to, limit, offset }) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'session'::text AS type, a.assigned_at AS occurred_at, t.table_number::text AS table_name,
              NULL::text AS category, NULL::numeric AS db_level, NULL::text AS status
       FROM table_assignments a JOIN tables t ON t.id=a.table_id WHERE a.occupant_id=$1
       UNION ALL
       SELECT 'incident', i.occurred_at, t.table_number::text, i.category, i.db_level, i.status
       FROM incidents i JOIN tables t ON t.id=i.table_id WHERE i.occupant_id=$1
     ) activity
     WHERE ($2::timestamptz IS NULL OR occurred_at >= $2) AND ($3::timestamptz IS NULL OR occurred_at < $3)
     ORDER BY occurred_at DESC LIMIT $4 OFFSET $5`,
    [id, from, to, limit, offset]
  );
  return rows;
}

export async function logCount(id, { from, to }) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT assigned_at AS occurred_at FROM table_assignments WHERE occupant_id=$1
       UNION ALL SELECT occurred_at FROM incidents WHERE occupant_id=$1
     ) activity WHERE ($2::timestamptz IS NULL OR occurred_at >= $2)
       AND ($3::timestamptz IS NULL OR occurred_at < $3)`,
    [id, from, to]
  );
  return rows[0].count;
}

export async function violations(id, { from, to, limit, offset }) {
  const { rows } = await query(
    `SELECT v.created_at AS date, t.table_number AS table_name, i.category AS noise_category,
            i.db_level, i.status, v.violation_number
     FROM violations v JOIN tables t ON t.id=v.table_id
     LEFT JOIN incidents i ON i.id=v.incident_id
     WHERE v.occupant_id=$1 AND ($2::timestamptz IS NULL OR v.created_at >= $2)
       AND ($3::timestamptz IS NULL OR v.created_at < $3)
     ORDER BY v.created_at DESC LIMIT $4 OFFSET $5`,
    [id, from, to, limit, offset]
  );
  return rows;
}

export async function filteredViolationCount(id, { from, to }) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM violations v WHERE v.occupant_id=$1
     AND ($2::timestamptz IS NULL OR v.created_at >= $2) AND ($3::timestamptz IS NULL OR v.created_at < $3)`,
    [id, from, to]
  );
  return rows[0].count;
}

export async function violationCount(id) {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM violations WHERE occupant_id=$1", [id]);
  return rows[0].count;
}
// The incidents service assigns each new violation as previous count + 1.
export const currentViolationCount = violationCount;
