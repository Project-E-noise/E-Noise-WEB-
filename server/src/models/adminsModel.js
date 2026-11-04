import { query } from "../config/db.js";

export async function findByEmail(email) {
  const { rows } = await query("SELECT * FROM admins WHERE LOWER(email) = LOWER($1)", [email]);
  return rows[0] || null;
}

export async function findById(id) {
  const { rows } = await query("SELECT * FROM admins WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function findByVerificationToken(token) {
  const { rows } = await query("SELECT * FROM admins WHERE verification_token = $1", [token]);
  return rows[0] || null;
}

export async function create({ full_name, email, password_hash, verification_token, verification_token_expires_at }) {
  const { rows } = await query(
    `INSERT INTO admins (full_name, email, password_hash, is_verified, status, verification_token, verification_token_expires_at)
     VALUES ($1, $2, $3, FALSE, 'UNVERIFIED', $4, $5)
     RETURNING *`,
    [full_name, email, password_hash, verification_token, verification_token_expires_at]
  );
  return rows[0];
}

export async function markVerified(id) {
  const { rows } = await query(
    `UPDATE admins
     SET is_verified = TRUE, status = 'VERIFIED', verification_token = NULL,
         verification_token_expires_at = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return rows[0];
}

export async function setVerificationToken(id, { verification_token, verification_token_expires_at }) {
  const { rows } = await query(
    `UPDATE admins
     SET verification_token = $2, verification_token_expires_at = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, verification_token, verification_token_expires_at]
  );
  return rows[0];
}

export function publicAdmin(admin) {
  return {
    id: admin.id,
    full_name: admin.full_name,
    email: admin.email,
    status: admin.status,
    is_verified: admin.is_verified,
    created_at: admin.created_at
  };
}
