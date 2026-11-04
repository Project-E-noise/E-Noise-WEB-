import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString("hex");
  // eslint-disable-next-line no-console
  console.warn(
    "[config] JWT_SECRET is not set — using a temporary in-memory secret for this run.\n" +
      "         Existing admin sessions will be invalidated every restart.\n" +
      "         Set JWT_SECRET in your .env before deploying."
  );
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || null,
  smtp: {
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    from: process.env.EMAIL_FROM || "Project E-Noise <no-reply@studify.local>"
  },
  hivemq: {
    host: process.env.HIVEMQ_HOST || null,
    port: Number(process.env.HIVEMQ_PORT) || 8883,
    username: process.env.HIVEMQ_USERNAME || null,
    password: process.env.HIVEMQ_PASSWORD || null
  },
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://localhost:8001"
};
