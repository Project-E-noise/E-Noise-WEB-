// Fills the database with realistic demo data:
//   - 7 tables (NODE-001 .. NODE-007) with sensor status rows
//   - 7 days of noise readings (one every 5 minutes per table)
//   - 8 occupants, table assignments, incidents and violations that follow
//     the 3-strike / one-week ban rule (one active ban, one ended ban)
//   - one admin account and one client account (see README for passwords)
//
// Safe to run more than once: existing accounts, tables and occupants are
// left alone, and the history (readings/incidents) is only added once.
//
//   npm run db:seed
//
import bcrypt from "bcryptjs";
import pg from "pg";
import dotenv from "dotenv";
import { pgConfig } from "../src/config/dbConfig.js";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@enoise.local";
const CLIENT_EMAIL = process.env.SEED_CLIENT_EMAIL || "client@enoise.local";
// Demo passwords for local use. In production you must choose your own.
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || (isProduction ? null : "Admin@12345");
const CLIENT_PASSWORD = process.env.SEED_CLIENT_PASSWORD || (isProduction ? null : "Client@12345");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const READING_EVERY_MS = 5 * 60 * 1000;
const HISTORY_DAYS = 7;
const HUB_UTC_OFFSET_HOURS = 8; // Cagayan de Oro (Asia/Manila), used for busy hours

// Small seeded random generator so every seed run produces the same data.
let randomState = 20260917;
function random() {
  randomState = (randomState * 1664525 + 1013904223) % 4294967296;
  return randomState / 4294967296;
}
const round1 = n => Math.round(n * 10) / 10;
const ago = ms => new Date(Date.now() - ms);

const TABLES = [1, 2, 3, 4, 5, 6, 7].map(n => ({
  table_number: n,
  sensor_node_id: `NODE-00${n}`,
  description: n <= 4 ? "Studify Study Hub - 2nd floor, window side" : "Studify Study Hub - 2nd floor, quiet zone",
  // The quiet-zone tables use slightly stricter thresholds.
  warning_threshold: n <= 4 ? 50 : 48,
  critical_threshold: n <= 4 ? 60 : 58,
  status: n === 7 ? "PAUSED" : "AVAILABLE"
}));

const OCCUPANTS = [
  { key: "juan", full_name: "Juan Dela Cruz", email: "juan.delacruz@example.com" },
  { key: "maria", full_name: "Maria Santos", email: CLIENT_EMAIL, client: true },
  { key: "pedro", full_name: "Pedro Reyes", email: "pedro.reyes@example.com" },
  { key: "ana", full_name: "Ana Villanueva", email: "ana.villanueva@example.com" },
  { key: "jose", full_name: "Jose Mercado", email: null },
  { key: "carmen", full_name: "Carmen Bautista", email: "carmen.bautista@example.com" },
  { key: "miguel", full_name: "Miguel Garcia", email: null },
  { key: "liza", full_name: "Liza Ramos", email: "liza.ramos@example.com" }
];

// Who sits where right now (table number). Juan is banned, so he has no seat.
const CURRENT_SEATS = { maria: 2, pedro: 3, ana: 4, carmen: 5, miguel: 1 };

// Incident history: [occupant key or null, table number, category, dB, hours ago, status]
const INCIDENTS = [
  // Pedro: 3 strikes 10 days ago -> banned, ban already ended. 1 new strike yesterday.
  ["pedro", 3, "Loud Conversation", 63.2, 10 * 24 + 6, "CONFIRMED"],
  ["pedro", 3, "Mobile Phone Noise", 61.4, 10 * 24 + 4, "CONFIRMED"],
  ["pedro", 3, "Loud Conversation", 64.8, 10 * 24 + 2, "CONFIRMED"],
  ["pedro", 3, "Impact Noise", 66.1, 26, "CONFIRMED"],
  // Juan: 3 strikes in the last few days -> currently banned.
  ["juan", 6, "Loud Conversation", 62.5, 4 * 24 + 3, "CONFIRMED"],
  ["juan", 6, "Loud Conversation", 65.0, 3 * 24 + 5, "CONFIRMED"],
  ["juan", 6, "Mobile Phone Noise", 60.9, 2 * 24 + 1, "CONFIRMED"],
  // Maria (client account): 2 strikes, one dismissed incident.
  ["maria", 2, "Mobile Phone Noise", 61.7, 5 * 24 + 2, "CONFIRMED"],
  ["maria", 2, "Impact Noise", 59.1, 3 * 24, "DISMISSED"],
  ["maria", 2, "Loud Conversation", 62.3, 20, "CONFIRMED"],
  // Others.
  ["ana", 4, "Impact Noise", 63.9, 6 * 24 + 7, "CONFIRMED"],
  ["carmen", 5, "Loud Conversation", 58.6, 2 * 24 + 9, "CONFIRMED"],
  ["miguel", 1, "Mobile Phone Noise", 61.0, 9, "CONFIRMED"],
  // Nobody assigned at the time.
  [null, 1, "Impact Noise", 67.4, 5 * 24 + 8, "CONFIRMED"],
  [null, 4, "Loud Conversation", 60.2, 4 * 24 + 6, "CONFIRMED"],
  [null, 5, "Ambient Baseline", 58.1, 30, "DISMISSED"],
  [null, 2, "Loud Conversation", 61.8, 3, "CONFIRMED"]
];

/** Typical dB level for a table at a given moment (busy afternoons, quiet nights). */
function demoLevel(table, time) {
  const localHour = (time.getUTCHours() + HUB_UTC_OFFSET_HOURS) % 24;
  const open = localHour >= 8 && localHour < 22;
  const busy = localHour >= 13 && localHour < 18;
  let level = open ? 41 + table.table_number * 0.6 : 33;
  if (busy) level += 4;
  level += (random() - 0.5) * 6;
  if (open && random() < 0.02) level = table.warning_threshold + random() * 12; // short loud moments
  return Math.max(30, Math.min(85, level));
}

async function upsertAccounts(client) {
  if (!ADMIN_PASSWORD || !CLIENT_PASSWORD) {
    console.log("[seed] Production: set SEED_ADMIN_PASSWORD and SEED_CLIENT_PASSWORD to create the demo accounts. Skipping accounts.");
    return;
  }
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const { rowCount } = await client.query(
    `INSERT INTO admins (full_name, email, password_hash, is_verified, status)
     VALUES ('Demo Administrator', $1, $2, TRUE, 'VERIFIED')
     ON CONFLICT (email) DO NOTHING`,
    [ADMIN_EMAIL, adminHash]
  );
  console.log(rowCount ? `[seed] Created admin ${ADMIN_EMAIL}` : `[seed] Admin ${ADMIN_EMAIL} already exists (password unchanged)`);
}

async function upsertTables(client) {
  const ids = {};
  for (const t of TABLES) {
    await client.query(
      `INSERT INTO tables (table_number, sensor_node_id, description, warning_threshold, critical_threshold, confirmation_seconds, status)
       VALUES ($1, $2, $3, $4, $5, 10, $6)
       ON CONFLICT DO NOTHING`,
      [t.table_number, t.sensor_node_id, t.description, t.warning_threshold, t.critical_threshold, t.status]
    );
    const { rows } = await client.query("SELECT id FROM tables WHERE table_number = $1", [t.table_number]);
    if (!rows[0]) continue; // its node id is already used by another table number
    ids[t.table_number] = rows[0].id;
    await client.query(
      "INSERT INTO sensor_status (table_id, is_online, last_seen) VALUES ($1, FALSE, NULL) ON CONFLICT (table_id) DO NOTHING",
      [rows[0].id]
    );
  }
  return ids;
}

async function upsertOccupants(client) {
  const ids = {};
  const clientHash = CLIENT_PASSWORD ? await bcrypt.hash(CLIENT_PASSWORD, 10) : null;
  for (const o of OCCUPANTS) {
    const existing = o.email
      ? await client.query("SELECT id FROM occupants WHERE LOWER(email) = LOWER($1)", [o.email])
      : await client.query("SELECT id FROM occupants WHERE full_name = $1 AND email IS NULL", [o.full_name]);
    if (existing.rows[0]) {
      ids[o.key] = existing.rows[0].id;
      continue;
    }
    const isClient = o.client && clientHash;
    const { rows } = await client.query(
      `INSERT INTO occupants (full_name, email, contact, status, password_hash, email_verified)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $5) RETURNING id`,
      [o.full_name, o.email, o.client ? "0917 123 4567" : "", isClient ? clientHash : null, Boolean(isClient)]
    );
    ids[o.key] = rows[0].id;
  }
  if (clientHash) console.log(`[seed] Client account: ${CLIENT_EMAIL}`);
  return ids;
}

async function insertReadings(client, tableIds) {
  const tableIdsList = [];
  const levels = [];
  const classes = [];
  const confidences = [];
  const times = [];
  const start = Date.now() - HISTORY_DAYS * DAY;
  for (const t of TABLES) {
    for (let at = start; at <= Date.now(); at += READING_EVERY_MS) {
      const time = new Date(at);
      const level = demoLevel(t, time);
      // The ML service only labels loud moments (audio is requested above warning).
      const loud = level >= t.warning_threshold;
      tableIdsList.push(tableIds[t.table_number]);
      levels.push(round1(level));
      classes.push(loud ? (random() < 0.6 ? "Loud Conversation" : random() < 0.5 ? "Mobile Phone Noise" : "Impact Noise") : null);
      confidences.push(loud ? round1(0.6 + random() * 0.35) : null);
      times.push(time.toISOString());
    }
  }
  // One INSERT for all rows (unnest turns the arrays back into rows).
  await client.query(
    `INSERT INTO noise_readings (table_id, db_level, classification, confidence, recorded_at)
     SELECT * FROM unnest($1::int[], $2::numeric[], $3::text[], $4::numeric[], $5::timestamptz[])`,
    [tableIdsList, levels, classes, confidences, times]
  );
  return levels.length;
}

async function insertHistory(client, tableIds, occupantIds) {
  // Past seats (released) so the client portal logs have some history.
  for (const [key, tableNumber] of Object.entries(CURRENT_SEATS)) {
    await client.query(
      "INSERT INTO table_assignments (table_id, occupant_id, assigned_at, released_at) VALUES ($1, $2, $3, $4)",
      [tableIds[tableNumber], occupantIds[key], ago(3 * DAY + 2 * HOUR), ago(3 * DAY - 2 * HOUR)]
    );
  }
  await client.query(
    "INSERT INTO table_assignments (table_id, occupant_id, assigned_at, released_at) VALUES ($1, $2, $3, $4)",
    [tableIds[6], occupantIds.juan, ago(5 * DAY), ago(2 * DAY)]
  );

  // Incidents in time order, applying the 3-strike rule as the app does.
  const strikes = {};
  const numbers = {};
  const sorted = [...INCIDENTS].sort((a, b) => b[4] - a[4]);
  for (const [key, tableNumber, category, db, hoursAgo, status] of sorted) {
    const occurredAt = ago(hoursAgo * HOUR);
    const occupantId = key ? occupantIds[key] : null;
    const { rows } = await client.query(
      `INSERT INTO incidents (table_id, occupant_id, category, db_level, confidence, duration_seconds, bulb_triggered, status, notes, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $9) RETURNING id`,
      [tableIds[tableNumber], occupantId, category, db, round1(0.65 + random() * 0.3), 10 + Math.floor(random() * 25), status,
        status === "DISMISSED" ? "Reviewed: not a real violation." : "", occurredAt]
    );
    if (!occupantId || status !== "CONFIRMED") continue;

    numbers[key] = (numbers[key] || 0) + 1;
    strikes[key] = (strikes[key] || 0) + 1;
    await client.query(
      "INSERT INTO violations (occupant_id, incident_id, table_id, violation_number, created_at) VALUES ($1, $2, $3, $4, $5)",
      [occupantId, rows[0].id, tableIds[tableNumber], numbers[key], occurredAt]
    );
    if (strikes[key] === 3) {
      strikes[key] = 0;
      const banUntil = new Date(occurredAt.getTime() + 7 * DAY);
      // A ban that already ended is stored as ACTIVE (the app does the same).
      await client.query(
        `UPDATE occupants SET status = $2, ban_started_at = $3, ban_until = $4, strikes_since = $3, updated_at = NOW() WHERE id = $1`,
        [occupantId, banUntil > new Date() ? "BANNED" : "ACTIVE", occurredAt, banUntil]
      );
    }
  }

  // Current seats.
  for (const [key, tableNumber] of Object.entries(CURRENT_SEATS)) {
    await client.query(
      "INSERT INTO table_assignments (table_id, occupant_id, assigned_at) VALUES ($1, $2, $3)",
      [tableIds[tableNumber], occupantIds[key], ago(2 * HOUR)]
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed] DATABASE_URL is not set. Copy server/.env.example to server/.env and set it first.");
    process.exit(1);
  }

  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    await upsertAccounts(client);
    const tableIds = await upsertTables(client);
    const occupantIds = await upsertOccupants(client);

    // History is only added to an empty database, so a second run adds nothing.
    const { rows } = await client.query("SELECT (SELECT COUNT(*) FROM noise_readings) + (SELECT COUNT(*) FROM incidents) AS count");
    if (TABLES.some(t => !tableIds[t.table_number])) {
      console.log("[seed] Some demo tables could not be created (node ids already in use): history not added.");
    } else if (Number(rows[0].count) > 0) {
      console.log("[seed] Readings/incidents already exist: history not added again.");
    } else {
      const readings = await insertReadings(client, tableIds);
      await insertHistory(client, tableIds, occupantIds);
      console.log(`[seed] Added ${readings} readings, ${INCIDENTS.length} incidents, assignments and violations.`);
    }
    await client.query("COMMIT");
    console.log("[seed] Done.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("[seed] Failed:", err.message);
  process.exit(1);
});
