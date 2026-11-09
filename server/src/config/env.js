import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

// In production the server refuses to start without these, so a bad
// deploy fails loudly instead of running with a random JWT secret or no DB.
if (isProduction) {
  const missing = ["JWT_SECRET", "DATABASE_URL"].filter(name => !process.env[name]);
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
  mlServiceUrl: (process.env.ML_SERVICE_URL || "http://localhost:8001").replace(/\/+$/, ""),
  mlApiKey: process.env.ML_API_KEY || ""
};
