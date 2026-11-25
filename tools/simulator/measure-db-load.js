// Measures how much database work the API does for N sensor nodes, using
// Postgres's own statistics (pg_stat_database / pg_stat_user_tables):
//   - transactions per minute (every autocommit query is one; ~ round trips)
//   - rows inserted / updated / deleted per minute, per table
//   - bytes per stored noise reading (table + indexes)
//
// Same safety rules as run-scenarios.js: throwaway LOCAL database only
// (name must contain "sim"), the API is started from this folder so
// server/.env is never read.
//
// Usage: node measure-db-load.js [--nodes 7] [--seconds 120]
// Phases: all nodes quiet, then 2 of them talking (loud streaks with audio).
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startBroker } from "./broker.js";
import { startMockMl } from "./mock-ml.js";
import { startVirtualNode } from "./virtual-node.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(here, "../../server");
const PG_BASE = (process.env.SIM_PG_URL || "postgresql://enoise@127.0.0.1:5433").replace(/\/+$/, "");
const DB = process.env.SIM_DB || "enoise_sim_load";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const NODES = arg("nodes", 7);
const SECONDS = arg("seconds", 120);
const PORTS = { api: 15065, broker: 18840, ml: 18011 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!["127.0.0.1", "localhost", "::1"].includes(new URL(PG_BASE).hostname)) throw new Error("SIM_PG_URL must be local.");
if (!/sim/i.test(DB)) throw new Error("SIM_DB must contain 'sim'.");

function runScript(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(SERVER_DIR, file)], { cwd: here, env: { ...process.env, DATABASE_URL: `${PG_BASE}/${DB}` }, stdio: "ignore" });
    p.on("exit", code => (code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`))));
  });
}

async function snapshot(db) {
  const [{ rows: [d] }, { rows: t }] = await Promise.all([
    db.query("SELECT xact_commit::bigint AS xact, tup_inserted::bigint AS ins, tup_updated::bigint AS upd, tup_deleted::bigint AS del, tup_returned::bigint AS ret FROM pg_stat_database WHERE datname = current_database()"),
    db.query("SELECT relname, n_tup_ins::bigint AS ins, n_tup_upd::bigint AS upd FROM pg_stat_user_tables")
  ]);
  return { at: Date.now(), d, t: Object.fromEntries(t.map(r => [r.relname, r])) };
}

function perMinute(a, b) {
  const min = (b.at - a.at) / 60000;
  const rate = (x, y) => Math.round((Number(y) - Number(x)) / min);
  const tables = {};
  for (const name of Object.keys(b.t)) {
    const ins = rate(a.t[name]?.ins ?? 0, b.t[name].ins);
    const upd = rate(a.t[name]?.upd ?? 0, b.t[name].upd);
    if (ins || upd) tables[name] = { inserts: ins, updates: upd };
  }
  return {
    transactions: rate(a.d.xact, b.d.xact),
    rowsWritten: rate(a.d.ins, b.d.ins) + rate(a.d.upd, b.d.upd) + rate(a.d.del, b.d.del),
    tables
  };
}

async function phase(db, label, scenarios) {
  const nodes = scenarios.map((s, i) => startVirtualNode({ nodeId: `NODE-${String(i + 1).padStart(3, "0")}`, broker: `mqtt://127.0.0.1:${PORTS.broker}`, scenario: s, seconds: 0, loop: true, quiet: true }));
  await sleep(10000); // warm-up: connections, first streaks
  const a = await snapshot(db);
  await sleep(SECONDS * 1000);
  const b = await snapshot(db);
  await Promise.all(nodes.map(n => n.stop({ abrupt: false })));
  const sent = nodes.reduce((sum, n) => sum + n.stats.telemetry, 0);
  return { label, nodes: scenarios.length, ...perMinute(a, b), readingsSentTotal: sent };
}

async function main() {
  const admin = new pg.Client({ connectionString: `${PG_BASE}/postgres` });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  await runScript("db/migrate.js");
  await runScript("db/seed-tables.js");

  const db = new pg.Client({ connectionString: `${PG_BASE}/${DB}` });
  await db.connect();
  // All 7 tables active (table 7 is PAUSED by default; un-pause it for the measurement).
  await db.query("UPDATE tables SET status = 'AVAILABLE'");

  const broker = await startBroker({ port: PORTS.broker, quiet: true });
  const ml = await startMockMl({ port: PORTS.ml, quiet: true });
  const server = spawn(process.execPath, [path.join(SERVER_DIR, "src/server.js")], {
    cwd: here,
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "development", PORT: String(PORTS.api),
      DATABASE_URL: `${PG_BASE}/${DB}`, JWT_SECRET: randomBytes(32).toString("hex"), CORS_ORIGIN: "http://localhost:5173", CLIENT_URL: "http://localhost:5173",
      HIVEMQ_HOST: "127.0.0.1", HIVEMQ_PORT: String(PORTS.broker), MQTT_PROTOCOL: "mqtt", ML_SERVICE_URL: ml.url, EMAIL_PROVIDER: ""
    },
    stdio: "ignore"
  });
  await sleep(4000);

  const results = [];
  results.push(await phase(db, "all quiet", Array(NODES).fill("quiet")));
  results.push(await phase(db, "2 talking, rest quiet", Array(NODES).fill("quiet").map((s, i) => (i < 2 ? "talking" : s))));

  const { rows: [size] } = await db.query(
    "SELECT pg_total_relation_size('noise_readings')::bigint AS bytes, (SELECT COUNT(*) FROM noise_readings)::bigint AS n"
  );
  const bytesPerRow = Math.round(Number(size.bytes) / Number(size.n));

  server.kill();
  await db.end();
  await ml.close();
  await broker.close();

  console.log(JSON.stringify({ nodes: NODES, secondsPerPhase: SECONDS, results, noiseReadings: { rows: Number(size.n), bytesTotal: Number(size.bytes), bytesPerRow } }, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
