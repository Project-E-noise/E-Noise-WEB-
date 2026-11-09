// Shared setup for the API tests. Every test file calls resetDatabase()
// first, which WIPES the test database and runs all migrations again.
//
// Needs TEST_DATABASE_URL (in server/.env or the environment) pointing to
// a separate, empty database whose name contains "test", e.g.
//   TEST_DATABASE_URL=postgresql://user:password@localhost:5432/enoise_test
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

dotenv.config();

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("Set TEST_DATABASE_URL (a separate database whose name contains 'test') before running npm test.");
if (!/test/i.test(new URL(testUrl).pathname)) throw new Error("TEST_DATABASE_URL must point to a database with 'test' in its name. The tests delete all its data.");

// These must be set before the app code is imported.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-the-checks-1234";
process.env.ADMIN_SIGNUP_CODE = "letmein-test";
process.env.CORS_ORIGIN = "http://localhost:5173,https://enoise-*.vercel.app";
process.env.HIVEMQ_HOST = "";
process.env.ML_SERVICE_URL = "http://127.0.0.1:9"; // nothing listens here: ML is "down"

const { default: request } = await import("supertest");
const { app } = await import("../src/app.js");
const { pool } = await import("../src/config/db.js");
const { runMigrations } = await import("../db/migrate.js");
const { signSession } = await import("../src/utils/tokens.js");
const { testOutbox } = await import("../src/services/emailService.js");

export { app, pool, request, testOutbox };
export const api = () => request(app);
export const query = (text, params) => pool.query(text, params);

export async function resetDatabase() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const client = await pool.connect();
  try {
    await runMigrations(client, { log: () => {} });
  } finally {
    client.release();
  }
  testOutbox.length = 0;
}

export async function closeDatabase() {
  await pool.end();
}

// ---- Quick data builders ----------------------------------------------

let counter = 0;
const next = () => ++counter;

export async function createAdmin({ verified = true, status } = {}) {
  const n = next();
  const { rows } = await query(
    `INSERT INTO admins (full_name, email, password_hash, is_verified, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [`Admin ${n}`, `admin${n}@test.local`, await bcrypt.hash("Password123", 4), verified, status || (verified ? "VERIFIED" : "UNVERIFIED")]
  );
  return { ...rows[0], password: "Password123", token: signSession(rows[0].id, "admin") };
}

export async function createTable(overrides = {}) {
  const n = next();
  const t = { table_number: n, sensor_node_id: `NODE-T${n}`, warning_threshold: 50, critical_threshold: 60, confirmation_seconds: 10, ...overrides };
  const { rows } = await query(
    `INSERT INTO tables (table_number, sensor_node_id, warning_threshold, critical_threshold, confirmation_seconds)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [t.table_number, t.sensor_node_id, t.warning_threshold, t.critical_threshold, t.confirmation_seconds]
  );
  await query("INSERT INTO sensor_status (table_id) VALUES ($1)", [rows[0].id]);
  return rows[0];
}

export async function createOccupant({ email, password, verified = true } = {}) {
  const n = next();
  const { rows } = await query(
    `INSERT INTO occupants (full_name, email, password_hash, email_verified)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [`Occupant ${n}`, email ?? null, password ? await bcrypt.hash(password, 4) : null, password ? verified : false]
  );
  return { ...rows[0], token: signSession(rows[0].id, "client") };
}

export async function assign(occupantId, tableId) {
  await query("INSERT INTO table_assignments (table_id, occupant_id) VALUES ($1, $2)", [tableId, occupantId]);
}

export const bearer = token => ({ Authorization: `Bearer ${token}` });
