import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

// Limits repeated attempts on login, registration, email and password
// endpoints so nobody can guess passwords or spam emails quickly.
// Counts are kept in memory per IP (fine for one small server).
function limiter({ windowMinutes, limit, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    // Tests make many requests in a row, so they get a much higher limit.
    limit: env.nodeEnv === "test" ? 1000 : limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: message }
  });
}

export const loginLimiter = limiter({
  windowMinutes: 15,
  limit: 10,
  message: "Too many sign-in attempts. Please wait 15 minutes and try again."
});

export const registerLimiter = limiter({
  windowMinutes: 60,
  limit: 10,
  message: "Too many registration attempts. Please try again in an hour."
});

export const emailLimiter = limiter({
  windowMinutes: 60,
  limit: 5,
  message: "Too many email requests. Please try again in an hour."
});

export const passwordLimiter = limiter({
  windowMinutes: 15,
  limit: 10,
  message: "Too many password attempts. Please wait 15 minutes and try again."
});
