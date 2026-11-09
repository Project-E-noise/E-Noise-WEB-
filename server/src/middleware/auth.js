import * as clientsModel from "../models/clientsModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { unauthorized, forbidden } from "../utils/errors.js";
import { verifyAdminToken } from "../utils/verifyAdminToken.js";
import { readSession } from "../utils/tokens.js";

const ADMIN_REASONS = {
  invalid: [unauthorized, "Session expired or invalid. Please sign in again."],
  not_found: [unauthorized, "Account no longer exists."],
  disabled: [forbidden, "This administrator account has been disabled."],
  unverified: [forbidden, "Email verification required. Please verify your email before logging in."],
  wrong_role: [forbidden, "Administrator access required."]
};

function bearerToken(req) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) throw unauthorized("Missing or invalid authorization header.");
  return token;
}

// Admin routes: only a valid, verified, enabled admin token gets through.
// Client tokens are rejected with 403.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const result = await verifyAdminToken(bearerToken(req));
  if (!result.ok) {
    const [error, message] = ADMIN_REASONS[result.reason] || ADMIN_REASONS.invalid;
    throw error(message);
  }
  req.admin = result.admin;
  next();
});

// Client routes: only a client token gets through, and req.clientId comes
// from the token, so a client can only ever see their own data.
export const requireClient = asyncHandler(async (req, res, next) => {
  const payload = readSession(bearerToken(req));
  if (!payload) throw unauthorized("Session expired or invalid. Please sign in again.");
  if (payload.role !== "client") throw forbidden("Client access required.");

  const client = await clientsModel.findById(payload.sub);
  if (!client || !client.is_active) throw unauthorized("Account no longer exists.");
  if (!client.email_verified) throw forbidden("Email verification required.");
  req.client = clientsModel.publicClient(client);
  req.clientId = client.id;
  next();
});
