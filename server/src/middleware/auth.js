import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import * as clientsModel from "../models/clientsModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { unauthorized, forbidden } from "../utils/errors.js";
import { verifyAdminToken } from "../utils/verifyAdminToken.js";

const ADMIN_REASONS = {
  invalid: [unauthorized, "Session expired or invalid. Please sign in again."],
  not_found: [unauthorized, "Account no longer exists."],
  disabled: [forbidden, "This administrator account has been disabled."],
  unverified: [forbidden, "Email verification required. Please verify your email before logging in."],
  wrong_role: [forbidden, "Administrator access required."]
};

export function requireRole(role) {
  return asyncHandler(async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized("Missing or invalid authorization header.");

    if (role === "admin") {
      const result = await verifyAdminToken(token);
      if (!result.ok) {
        const [error, message] = ADMIN_REASONS[result.reason] || ADMIN_REASONS.invalid;
        throw error(message);
      }
      req.admin = result.admin;
      return next();
    }

    let payload;
    try { payload = jwt.verify(token, env.jwtSecret); }
    catch { throw unauthorized("Session expired or invalid. Please sign in again."); }
    if (payload.role !== role) throw forbidden(`${role === "client" ? "Client" : "Authorized"} access required.`);
    const client = await clientsModel.findById(payload.sub);
    if (!client || !client.is_active) throw unauthorized("Account no longer exists.");
    if (!client.email_verified) throw forbidden("Email verification required.");
    req.client = clientsModel.publicClient(client);
    req.clientId = client.id;
    return next();
  });
}

export const requireAuth = requireRole("admin");
export const requireClient = requireRole("client");
