import crypto from "crypto";
import dotenv from "dotenv";
import { readThresholdDefaults } from "./thresholdDefaults.js";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

// In production the server refuses to start without these, so a bad
// deploy fails loudly instead of running with a random JWT secret, no DB, or
// localhost defaults (CORS would block the real website, and email links
// would point to localhost).
if (isProduction) {
  const missing = ["JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN", "CLIENT_URL"].filter(name => !(process.env[name] || "").trim());
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`[config] Missing required environment variable(s) in production: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32) {
    // eslint-disable-next-line no-console
    console.error("[config] JWT_SECRET must be at least 32 characters in production.");
    process.exit(1);
  }
}

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString("hex");
  if (nodeEnv !== "test") {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] JWT_SECRET is not set. Using a temporary secret for this run,\n" +
        "         so everyone is signed out on every restart. Set JWT_SECRET in server/.env."
    );
  }
}

// How long a sensor may stay silent before it counts as offline. Nodes
// report every second, so 15 s is already a long silence.
const sensorStaleSeconds = process.env.SENSOR_STALE_SECONDS ? Number(process.env.SENSOR_STALE_SECONDS) : 15;
if (!Number.isInteger(sensorStaleSeconds) || sensorStaleSeconds <= 0) {
  // eslint-disable-next-line no-console
  console.error("[config] SENSOR_STALE_SECONDS must be a positive whole number of seconds.");
  process.exit(1);
}

// Violations older than this many days are deleted by a daily cleanup, so
// strikes only count the recent past.
const violationRetentionDays = process.env.VIOLATION_RETENTION_DAYS ? Number(process.env.VIOLATION_RETENTION_DAYS) : 30;
if (!Number.isInteger(violationRetentionDays) || violationRetentionDays <= 0) {
  // eslint-disable-next-line no-console
  console.error("[config] VIOLATION_RETENTION_DAYS must be a positive whole number of days.");
  process.exit(1);
}

// Raw noise readings older than this many days are deleted every hour, to
// keep the database small (Neon free plan: 1 GB).
const noiseReadingsRetentionDays = process.env.NOISE_READINGS_RETENTION_DAYS ? Number(process.env.NOISE_READINGS_RETENTION_DAYS) : 7;
if (!Number.isInteger(noiseReadingsRetentionDays) || noiseReadingsRetentionDays <= 0) {
  // eslint-disable-next-line no-console
  console.error("[config] NOISE_READINGS_RETENTION_DAYS must be a positive whole number of days.");
  process.exit(1);
}

// ---- Violation gating (see src/utils/violationRules.js) -----------------
// Numbers here are PLACEHOLDERS to tune with recordings from the study hub,
// not measured values.
function readNumber(name, fallback, { min, max, integer = false }) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    // eslint-disable-next-line no-console
    console.error(`[config] ${name} must be ${integer ? "a whole number" : "a number"} between ${min} and ${max}.`);
    process.exit(1);
  }
  return value;
}

// A label only counts toward the verdict at or above this confidence (0-1).
const minConfidence = readNumber("MIN_CONFIDENCE", 0.5, { min: 0, max: 1 });
// Sustained time for a phone label (seconds). Phone rings are short bursts,
// so this is lower than the table's confirmation_seconds. Never longer.
const phoneConfirmationSeconds = readNumber("PHONE_CONFIRMATION_SECONDS", 4, { min: 0, max: 3600, integer: true });
// Strikes one occupant can get in any rolling 24 hours, so a long noisy
// session can't produce a 3-strike ban within minutes.
const maxStrikesPerDay = readNumber("MAX_STRIKES_PER_DAY", 1, { min: 1, max: 100, integer: true });
// No new streak starts on a table for this long after one was decided.
const violationCooldownSeconds = readNumber("VIOLATION_COOLDOWN_SECONDS", 120, { min: 0, max: 86400, integer: true });

// Thresholds given to NEW tables (provisional, see thresholdDefaults.js).
let thresholdDefaults;
try {
  thresholdDefaults = readThresholdDefaults();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(`[config] ${err.message}`);
  process.exit(1);
}

// ML service. Unset in production = classification off (every loud
// streak becomes UNVERIFIED). Development defaults to a local service.
const mlServiceUrlRaw = (process.env.ML_SERVICE_URL || "").trim();
const mlApiKey = process.env.ML_API_KEY || "";
if (isProduction && mlServiceUrlRaw && !mlApiKey) {
  // eslint-disable-next-line no-console
  console.error("[config] ML_SERVICE_URL is set but ML_API_KEY is empty. Set ML_API_KEY (same value as the ML service) in production.");
  process.exit(1);
}
const mlServiceUrl = (mlServiceUrlRaw || (isProduction ? "" : "http://localhost:8001")).replace(/\/+$/, "") || null;

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv,
  isProduction,
  corsOrigins,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // Admin sessions are shorter (and can be revoked, see token_version).
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "1d",
  clientUrl: (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, ""),
  databaseUrl: process.env.DATABASE_URL || null,
  // Admin registration needs this code. If it is empty, nobody can register
  // as an admin through the website (use `npm run db:seed` or ask an admin).
  adminSignupCode: process.env.ADMIN_SIGNUP_CODE || "",
  email: {
    // "brevo" (HTTP API, works on Render free), "smtp" (local dev), or
    // empty = print emails to the console.
    provider: (process.env.EMAIL_PROVIDER || "").toLowerCase(),
    from: process.env.EMAIL_FROM || "Project E-Noise <no-reply@example.com>",
    brevoApiKey: process.env.BREVO_API_KEY || null
  },
  smtp: {
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null
  },
  hivemq: {
    host: process.env.HIVEMQ_HOST || null,
    port: Number(process.env.HIVEMQ_PORT) || 8883,
    username: process.env.HIVEMQ_USERNAME || null,
    password: process.env.HIVEMQ_PASSWORD || null,
    // "mqtts" (TLS, HiveMQ Cloud) or "mqtt" for a local plain broker.
    protocol: process.env.MQTT_PROTOCOL || "mqtts"
  },
  sensorStaleSeconds,
  violationRetentionDays,
  noiseReadingsRetentionDays,
  mlServiceUrl,
  mlApiKey,
  minConfidence,
  phoneConfirmationSeconds,
  maxStrikesPerDay,
  violationCooldownSeconds,
  defaultWarningThreshold: thresholdDefaults.warning,
  defaultCriticalThreshold: thresholdDefaults.critical
};
