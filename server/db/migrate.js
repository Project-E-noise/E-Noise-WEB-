// Applies every .sql file in db/migrations/, in filename order, that hasn't
// already been recorded in schema_migrations. Safe to re-run: already-applied
// migrations are skipped.
//
//   npm run db:migrate
//
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import pg from "pg";
import dotenv from "dotenv";
import { pgConfig } from "../src/config/dbConfig.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/** Applies all pending migrations using an already-connected pg client. */
export async function runMigrations(client, { log = console.log } = {}) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename     VARCHAR(255) PRIMARY KEY,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await client.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map(r => r.filename));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    log(`[migrate] Applying ${file}...`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran += 1;
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
  return ran;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[migrate] DATABASE_URL is not set. Copy server/.env.example to server/.env and set it first.");
    process.exit(1);
  }

  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const ran = await runMigrations(client);
    console.log(ran ? `[migrate] Applied ${ran} migration(s).` : "[migrate] Already up to date.");
  } finally {
    await client.end();
  }
}

// Only run when called as a script (npm run db:migrate), not when imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
