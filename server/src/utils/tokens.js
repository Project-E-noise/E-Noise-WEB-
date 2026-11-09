import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Random token for email verification / password setup links. */
export function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Signs a login session. role is "admin" or "client". */
export function signSession(id, role) {
  return jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn, algorithm: "HS256" });
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
