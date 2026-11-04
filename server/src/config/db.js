import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

if (!env.databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    "[db] DATABASE_URL is not set. Set it in server/.env, e.g.\n" +
      "     DATABASE_URL=postgresql://user:password@localhost:5432/enoise\n" +
      "     The server will fail on the first query until this is set."
  );
}

export const pool = new Pool({
  connectionString: env.databaseUrl || undefined,
  // Small pool: this is a single-admin-dashboard backend, not a
  // high-concurrency public API. Raise if load testing says otherwise.
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on("error", err => {
  // Errors on idle clients (e.g. dropped connections) must not crash the process.
  // eslint-disable-next-line no-console
  console.error("[db] Unexpected error on idle client", err);
});

/** Run a single parameterized query against the pool. */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run `fn` inside a single client with an open transaction, committing on
 * success and rolling back on any thrown error. Use this whenever a
 * request needs more than one write to stay atomic (e.g. incident +
 * violation + occupant ban).
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
