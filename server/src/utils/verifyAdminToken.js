import * as adminsModel from "../models/adminsModel.js";
import { readSession } from "./tokens.js";

/**
 * Checks an admin JWT. Used by both the REST middleware and the WebSocket
 * handshake so the rules are the same in both places.
 * Returns { ok: true, admin } or { ok: false, reason } where reason is
 * "invalid" | "wrong_role" | "not_found" | "disabled" | "unverified".
 */
export async function verifyAdminToken(token) {
  const payload = readSession(token);
  if (!payload) return { ok: false, reason: "invalid" };
  if (payload.role !== "admin") return { ok: false, reason: "wrong_role" };

  const admin = await adminsModel.findById(payload.sub);
  if (!admin) return { ok: false, reason: "not_found" };
  if (admin.status === "DISABLED") return { ok: false, reason: "disabled" };
  if (!admin.is_verified) return { ok: false, reason: "unverified" };

  return { ok: true, admin: adminsModel.publicAdmin(admin) };
}
