import { ApiError } from "../utils/errors.js";

// Centralized error handling — every route uses asyncHandler + next(err),
// so this is the single place that shapes error responses and status codes.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ message: "Internal server error." });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` });
}
