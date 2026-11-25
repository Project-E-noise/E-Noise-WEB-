import bcrypt from "bcryptjs";

// Password hashing for admins and clients (and scripts/create-admin.js), so
// every account is hashed the same way. bcrypt is one-way: the original
// password can't be read back, only checked.

// Cost 10 = 2^10 rounds, ~100 ms per hash: slow enough to make guessing
// expensive, fast enough for a login.
export const BCRYPT_ROUNDS = 10;

// Email verification / password setup links work for 24 hours.
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Compared against when the email is unknown, so a wrong email takes about
// as long as a wrong password (makes guessing which emails exist harder).
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** True if `password` matches `hash`. A missing hash checks against DUMMY_HASH (always false). */
export function checkPassword(password, hash) {
  return bcrypt.compare(String(password ?? ""), hash || DUMMY_HASH);
}
