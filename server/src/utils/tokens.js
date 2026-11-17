import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Random token for email verification / password setup links. */
export function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Signs a login session. role is "admin" or "client". Admin tokens carry
 * the admin's token_version ("tv"): logging out bumps it, which revokes
 * every earlier token. Admin sessions use ADMIN_JWT_EXPIRES_IN (1 day).
 */
export function signSession(id, role, { version = 0 } = {}) {
  const payload = role === "admin" ? { sub: id, role, tv: version } : { sub: id, role };
  const expiresIn = role === "admin" ? env.adminJwtExpiresIn : env.jwtExpiresIn;
  return jwt.sign(payload, env.jwtSecret, { expiresIn, algorithm: "HS256" });
}

/** Returns the token payload, or null if the token is missing, invalid or expired. */
export function readSession(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

/** Compares two strings without leaking how many characters matched. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
