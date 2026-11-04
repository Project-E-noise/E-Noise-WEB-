import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import * as adminsModel from "../models/adminsModel.js";
import { publicAdmin } from "../services/authService.js";

/**
 * Verifies a Bearer JWT the same way for both the REST auth middleware and
 * the WebSocket handshake, so "who's allowed in" never drifts between the
 * two. Returns { ok: true, admin } on success, or { ok: false, reason }
 * where reason is "invalid" | "not_found" | "disabled" | "unverified" —
 * callers decide how to turn that into an HTTP status vs. a closed socket.
 */
export async function verifyAdminToken(token) {
  if (!token) return { ok: false, reason: "invalid" };

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const admin = await adminsModel.findById(payload.sub);
  if (!admin) return { ok: false, reason: "not_found" };
  if (admin.status === "DISABLED") return { ok: false, reason: "disabled" };
  if (!admin.is_verified) return { ok: false, reason: "unverified" };

  return { ok: true, admin: publicAdmin(admin) };
}
