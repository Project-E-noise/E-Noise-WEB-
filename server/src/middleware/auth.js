import { unauthorized, forbidden } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAdminToken } from "../utils/verifyAdminToken.js";

const REASON_MESSAGES = {
  invalid: ["unauthorized", "Session expired or invalid. Please sign in again."],
  not_found: ["unauthorized", "Account no longer exists."],
  disabled: ["forbidden", "This administrator account has been disabled."],
  unverified: ["forbidden", "Email verification required. Please verify your email before logging in."]
};

// Requires a valid Bearer JWT and attaches req.admin. Disabled/unverified
// admins are rejected even with a technically-valid token, since account
// status is authoritative on the backend (spec section 9). Shares its
// verification logic with the WebSocket handshake (see realtime/wsServer.js)
// via verifyAdminToken, so REST and WS never disagree on who's allowed in.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw unauthorized("Missing or invalid authorization header.");

  const result = await verifyAdminToken(token);
  if (!result.ok) {
    const [kind, message] = REASON_MESSAGES[result.reason];
    throw kind === "forbidden" ? forbidden(message) : unauthorized(message);
  }

  req.admin = result.admin;
  next();
});
