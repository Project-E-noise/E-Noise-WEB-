import { ApiError } from "../utils/errors.js";
import { env } from "../config/env.js";

// Postgres error codes we can explain to the user instead of returning 500.
const PG_ERRORS = {
  "22P02": [400, "One of the values has the wrong format."],
  "22003": [400, "One of the numbers is out of range."],
  "23505": [409, "That record already exists."],
  "23503": [409, "This record is linked to another record that does not exist or is still in use."],
  "23514": [400, "One of the values is not allowed."]
};

// Every error response has the same shape: { error: "message" }.
// Stack traces are only logged on the server, never sent to the browser.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  // Bad JSON body or a body that is too large (from express.json()).
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body must be valid JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });

  if (err.code && PG_ERRORS[err.code]) {
    const [status, message] = PG_ERRORS[err.code];
    return res.status(status).json({ error: message });
  }

  if (env.nodeEnv !== "test") {
    // eslint-disable-next-line no-console
    console.error(env.isProduction ? `[error] ${err.message}` : err);
  }
  return res.status(500).json({ error: "Something went wrong on the server. Please try again." });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}
