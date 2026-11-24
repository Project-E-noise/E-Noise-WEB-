// End-to-end check of the whole chain without hardware or cloud accounts:
//   virtual node(s) -> local MQTT broker -> API (server/) -> local Postgres
//   -> WebSocket (what the dashboard receives), with mock-ml.js as YAMNet.
//
// It creates a THROWAWAY database (name must contain "sim", host must be
// local), runs all migrations, starts the API with a local broker and the
// mock ML service, creates the first admin and the occupants through the
// real API, then plays each scenario and checks API responses, database
// rows and WebSocket messages. Results go to results/latest.md.
//
// It never reads server/.env (the API is started from this folder with
// every setting passed explicitly), so it can't touch Neon or HiveMQ.
//
// Usage (local Postgres must be running):
//   node run-scenarios.js
//   node run-scenarios.js --only quiet,talking      # some scenarios
// Settings (environment):
//   SIM_PG_URL  default postgresql://enoise@127.0.0.1:5433   (no database name)
//   SIM_DB      default enoise_sim  (dropped and re-created!)
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import mqtt from "mqtt";
import { startBroker } from "./broker.js";
import { startMockMl } from "./mock-ml.js";
import { startVirtualNode } from "./virtual-node.js";
import { watch } from "./ws-watch.js";
import { buildWav } from "./firmware-model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(here, "../../server");
const RESULTS_DIR = path.join(here, "results");

const PG_BASE = (process.env.SIM_PG_URL || "postgresql://enoise@127.0.0.1:5433").replace(/\/+$/, "");
const SIM_DB = process.env.SIM_DB || "enoise_sim";
const PORTS = { api: 15055, broker: 18830, ml: 18001 };
const API = `http://127.0.0.1:${PORTS.api}`;

// Proposed starting thresholds for Studify (baseline ~60 dB, talking ~80-90 dB,
// both UNCALIBRATED). Tables 1-5 get them through the API; table 6 keeps what
// `npm run db:seed:tables` gave it (the DEFAULT_*_THRESHOLD defaults), so S1b
// checks those defaults.
const STUDIFY = { warning_threshold: 68, critical_threshold: 75, confirmation_seconds: 10 };

// Test-only speed-up: the default 120 s cooldown would make the run take ages.
const COOLDOWN_SECONDS = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const only = (() => {
  const i = process.argv.indexOf("--only");
  return i === -1 ? null : new Set(process.argv[i + 1].split(","));
})();

// ---------------------------------------------------------------------------
// Safety checks: local throwaway database only.
// ---------------------------------------------------------------------------
const pgHost = new URL(PG_BASE).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(pgHost)) throw new Error(`SIM_PG_URL must point to a local Postgres, not ${pgHost}.`);
if (!/sim/i.test(SIM_DB)) throw new Error("SIM_DB must contain 'sim' (it is dropped and re-created).");
if (fs.existsSync(path.join(here, ".env"))) throw new Error("tools/simulator/.env exists; remove it so the API can't pick up other settings.");

fs.mkdirSync(RESULTS_DIR, { recursive: true });
const serverLogPath = path.join(RESULTS_DIR, "server.log");
fs.writeFileSync(serverLogPath, "");

const secrets = {
  jwt: randomBytes(32).toString("hex"),
  invite: randomBytes(8).toString("hex"),
  mlKey: randomBytes(16).toString("hex"),
  adminPassword: `Sim-${randomBytes(6).toString("hex")}-Aa1`,
  clientPassword: `Sim-${randomBytes(6).toString("hex")}-Bb2`
};

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
async function recreateDatabase() {
  const admin = new pg.Client({ connectionString: `${PG_BASE}/postgres` });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${SIM_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${SIM_DB}`);
  await admin.end();
}

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: here, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (out += d));
    child.on("exit", code => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(script)} exited ${code}:\n${out}`))));
  });
}

const db = new pg.Pool({ connectionString: `${PG_BASE}/${SIM_DB}`, max: 3 });
const q = async (text, params) => (await db.query(text, params)).rows;

// ---------------------------------------------------------------------------
// API server as a child process
// ---------------------------------------------------------------------------
let server = null;
let serverLog = "";

function serverEnv(mockMlUrl) {
  return {
    NODE_ENV: "development",
    PORT: String(PORTS.api),
    DATABASE_URL: `${PG_BASE}/${SIM_DB}`,
    JWT_SECRET: secrets.jwt,
    CORS_ORIGIN: "http://localhost:5173,http://127.0.0.1:5173",
    CLIENT_URL: "http://localhost:5173",
    ADMIN_SIGNUP_CODE: secrets.invite,
    EMAIL_PROVIDER: "",
    SMTP_HOST: "",
    BREVO_API_KEY: "",
    HIVEMQ_HOST: "127.0.0.1",
    HIVEMQ_PORT: String(PORTS.broker),
    HIVEMQ_USERNAME: "",
    HIVEMQ_PASSWORD: "",
    MQTT_PROTOCOL: "mqtt",
    ML_SERVICE_URL: mockMlUrl,
    ML_API_KEY: secrets.mlKey,
    VIOLATION_COOLDOWN_SECONDS: String(COOLDOWN_SECONDS),
    MAX_STRIKES_PER_DAY: "1",
    SENSOR_STALE_SECONDS: "15"
  };
}

async function startServer(mockMlUrl) {
  const marker = serverLog.length;
  // SIM_NODE_BIN: run the API on another Node version (e.g. 22, like Render).
  // A native crash writes a diagnostic report into results/.
  const nodeBin = process.env.SIM_NODE_BIN || process.execPath;
  const flags = ["--report-on-fatalerror", "--report-uncaught-exception", `--report-directory=${RESULTS_DIR}`];
  server = spawn(nodeBin, [...flags, path.join(SERVER_DIR, "src/server.js")], {
    cwd: here, // no .env here, so dotenv loads nothing
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...serverEnv(mockMlUrl) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const onData = d => {
    serverLog += d;
    fs.appendFileSync(serverLogPath, d);
  };
  server.stdout.on("data", onData);
  server.stderr.on("data", onData);
  const proc = server;
  proc.on("exit", (code, signal) => onData(`\n[sim] API process exited (code ${code}, signal ${signal})${proc === server ? " UNEXPECTEDLY" : ""}\n`));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (serverLog.slice(marker).includes("[mqtt] Subscribed")) return marker;
    await sleep(200);
  }
  throw new Error("API did not start / subscribe within 20 s. See results/server.log");
}

async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise(resolve => {
    s.once("exit", resolve);
    s.kill(); // on Windows this is a hard kill, like a crash
  });
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function api(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

let adminToken = null;
const tables = {}; // table_number -> table row from the API
const occupants = {}; // key -> { id, email }

async function registerOccupant(key) {
  const email = `sim.${key}.${Date.now()}@example.test`;
  const reg = await api("POST", "/api/client/register", { body: { email, full_name: `Sim ${key.toUpperCase()}`, consent: true } });
  if (reg.status !== 201) throw new Error(`client register ${key}: ${reg.status} ${JSON.stringify(reg.data)}`);
  const [row] = await q("SELECT id, verification_token FROM occupants WHERE email = $1", [email]);
  const set = await api("POST", "/api/client/set-password", { body: { token: row.verification_token, password: secrets.clientPassword } });
  if (set.status !== 200) throw new Error(`set-password ${key}: ${set.status} ${JSON.stringify(set.data)}`);
  occupants[key] = { id: row.id, email };
  return occupants[key];
}

async function seat(key, tableNumber) {
  const res = await api("POST", `/api/occupants/${occupants[key].id}/assign`, { token: adminToken, body: { table_id: tables[tableNumber].id } });
  if (res.status !== 200 && res.status !== 201) throw new Error(`assign ${key} -> T${tableNumber}: ${res.status} ${JSON.stringify(res.data)}`);
}

async function incidentsSince(tableNumber, since) {
  const res = await api("GET", `/api/incidents?table_id=${tables[tableNumber].id}&from=${encodeURIComponent(since)}`, { token: adminToken });
  return Array.isArray(res.data) ? res.data : res.data?.incidents || [];
}
const violationCount = async key => (await q("SELECT COUNT(*)::int AS n FROM violations WHERE occupant_id = $1", [occupants[key].id]))[0].n;
const tableNow = async n => (await api("GET", `/api/tables/${tables[n].id}`, { token: adminToken })).data?.table;

// ---------------------------------------------------------------------------
// Running nodes
// ---------------------------------------------------------------------------
let broker;
let ml;
let ws;
const results = [];

const liveNodes = new Set();

function play(tableNumber, scenario, opts = {}) {
  const node = startVirtualNode({ nodeId: tables[tableNumber].sensor_node_id, broker: broker.url, scenario, quiet: true, ...opts });
  node.done = new Promise(resolve => node.once("done", resolve));
  liveNodes.add(node);
  const stop = node.stop;
  node.stop = async options => {
    liveNodes.delete(node);
    return stop(options);
  };
  return node;
}

// Resolves after `ms` even if `promise` never settles (cleanup must not hang).
const within = (promise, ms) => Promise.race([promise, sleep(ms)]);

async function playAndWait(list, { after = 10000 } = {}) {
  const nodes = list.map(([t, s]) => play(t, s));
  await Promise.all(nodes.map(n => n.done));
  await sleep(after);
  await Promise.all(nodes.map(n => n.stop({ abrupt: false })));
  return nodes;
}

function record(id, scenario, expected, actual, pass, evidence = "") {
  results.push({ id, scenario, expected, actual, pass, evidence });
  console.log(`${pass === true ? "PASS" : pass === false ? "FAIL" : "NOTE"}  ${id} ${scenario}: ${actual}`);
}

const wsIncidents = (tableNumber, since) =>
  ws.messages.filter(m => m.type === "incident:created" && m.incident.table_id === tables[tableNumber].id && m.at >= since);
const wsUpdates = (tableNumber, since) => ws.messages.filter(m => m.type === "table:update" && m.table.id === tables[tableNumber].id && m.at >= since);
const fmtInc = list => (list.length ? list.map(i => `${i.status}${i.category ? `/${i.category}` : ""}${i.filter_reason ? `/${i.filter_reason}` : ""}${i.bulb_triggered ? "/bulb" : ""}`).join(", ") : "no incident");
const want = name => !only || only.has(name);

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
async function smoke() {
  const health = await api("GET", "/health");
  const adminEmail = `sim.admin.${Date.now()}@example.test`;
  const reg = await api("POST", "/api/auth/register", {
    body: { full_name: "Sim Admin", email: adminEmail, password: secrets.adminPassword, invite_code: secrets.invite }
  });
  const badInvite = await api("POST", "/api/auth/register", {
    body: { full_name: "Intruder", email: `x.${Date.now()}@example.test`, password: secrets.adminPassword, invite_code: "wrong" }
  });
  const early = await api("POST", "/api/auth/login", { body: { email: adminEmail, password: secrets.adminPassword } });
  const [admin] = await q("SELECT verification_token FROM admins WHERE email = $1", [adminEmail]);
  const verify = await api("GET", `/api/auth/verify-email?token=${admin.verification_token}`);
  const login = await api("POST", "/api/auth/login", { body: { email: adminEmail, password: secrets.adminPassword } });
  adminToken = login.data?.token;
  const list = await api("GET", "/api/tables", { token: adminToken });
  const tableList = Array.isArray(list.data) ? list.data : list.data?.tables || [];
  for (const t of tableList) tables[t.table_number] = t;

  const createOccupant = await api("POST", "/api/occupants", { token: adminToken, body: { full_name: "X", email: "x@example.test" } });
  const occ = await registerOccupant("a");
  const clientLogin = await api("POST", "/api/client/login", { body: { email: occ.email, password: secrets.clientPassword } });
  const profile = await api("GET", "/api/client/profile", { token: clientLogin.data?.token });
  const clientOnAdmin = await api("GET", "/api/tables", { token: clientLogin.data?.token });
  const noToken = await api("GET", "/api/tables");
  const corsOk = await api("GET", "/health", { headers: { Origin: "http://localhost:5173" } });
  const corsBad = await api("GET", "/health", { headers: { Origin: "https://evil.example" } });

  const checks = [
    ["/health 200", health.status === 200 && health.data?.status === "ok"],
    ["admin register with invite 201", reg.status === 201],
    ["admin register with wrong invite 403", badInvite.status === 403],
    ["login before email verification 403", early.status === 403],
    ["verify-email 200", verify.status === 200],
    ["admin login 200 + token", login.status === 200 && Boolean(adminToken)],
    ["GET /api/tables lists NODE-001..007", tableList.length === 7 && tableList.every(t => /^NODE-00[1-7]$/.test(t.sensor_node_id))],
    ["no admin endpoint creates occupants (POST /api/occupants 404)", createOccupant.status === 404],
    ["occupant self-register + set password + login", clientLogin.status === 200 && profile.status === 200],
    ["client token on admin route 403", clientOnAdmin.status === 403],
    ["no token 401", noToken.status === 401],
    ["CORS: allowed origin echoed", corsOk.headers.get("access-control-allow-origin") === "http://localhost:5173"],
    ["CORS: other origin gets no CORS header", !corsBad.headers.get("access-control-allow-origin")]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  record("S0", "API smoke (local)", "health, first admin via invite, occupant self-signup, role checks, CORS", failed.length ? `failed: ${failed.join("; ")}` : `${checks.length}/${checks.length} checks OK`, failed.length === 0, checks.map(([n, ok]) => `${ok ? "ok" : "FAIL"} ${n}`).join("\n"));
}

async function setupTables() {
  for (const n of [1, 2, 3, 4, 5]) {
    const res = await api("PUT", `/api/thresholds/${tables[n].id}`, { token: adminToken, body: { ...STUDIFY, status: "AVAILABLE" } });
    if (res.status !== 200) throw new Error(`thresholds T${n}: ${res.status} ${JSON.stringify(res.data)}`);
    tables[n] = await tableNow(n);
  }
  tables[6] = await tableNow(6);
  for (const key of ["b", "c", "d", "e", "f", "g"]) await registerOccupant(key);
  await seat("e", 1);
  await seat("a", 2);
  await seat("b", 3);
  await seat("c", 4);
  await seat("d", 5);
  await seat("g", 6);
}

async function sQuietAndSeedThresholds() {
  const since = new Date().toISOString();
  const t0 = Date.now();
  const [n1, n6] = await playAndWait([[1, "quiet"], [6, "quiet"]], { after: 12000 });
  const inc1 = await incidentsSince(1, since);
  const readings = (await q("SELECT COUNT(*)::int AS n FROM noise_readings WHERE table_id = $1 AND created_at >= $2", [tables[1].id, since]))[0].n;
  const updates = wsUpdates(1, t0).length;
  record(
    "S1",
    "Quiet baseline (~60 dB traffic), thresholds 68/75",
    "Green LED levels, no events",
    `${fmtInc(inc1)}; LEDs max ${n1.stats.maxYellow} yellow / ${n1.stats.maxRed} red, critical ${n1.stats.criticalSeen ? "ON" : "off"}; ${readings} readings stored; ${updates} WS table:update; dB ${Math.min(...n1.stats.readings)}-${Math.max(...n1.stats.readings)}`,
    inc1.length === 0 && n1.stats.maxYellow === 0 && n1.stats.maxRed === 0 && !n1.stats.criticalSeen && readings >= 20 && updates >= 20
  );
  const inc6 = await incidentsSince(6, since);
  record(
    "S1b",
    `Same baseline on a table with the default thresholds from db:seed:tables (T6: ${tables[6].warning_threshold}/${tables[6].critical_threshold})`,
    "Green, no events",
    `${fmtInc(inc6)}; LEDs max ${n6.stats.maxYellow} yellow / ${n6.stats.maxRed} red; strikes for occupant: ${await violationCount("g")}`,
    inc6.length === 0 && n6.stats.maxYellow === 0 && n6.stats.maxRed === 0 && tables[6].warning_threshold === 68 && tables[6].critical_threshold === 75,
    "Before deploy-prep the defaults were 48/58 and 50/60: a 60 dB room then started a loud streak every couple of minutes."
  );
}

async function sSpike() {
  const since = new Date().toISOString();
  const before = await violationCount("a");
  const [n] = await playAndWait([[2, "spike"]]);
  const inc = await incidentsSince(2, since);
  const after = await violationCount("a");
  record("S2", "Short loud spike (4 s talking, ~85 dB) < 10 s threshold", "No event, no strike", `${fmtInc(inc)}; strikes ${before}->${after}; red LEDs max ${n.stats.maxRed}, critical ${n.stats.criticalSeen ? "ON" : "off"}`, inc.length === 0 && after === before && !n.stats.criticalSeen);
}

async function sTalking() {
  const since = new Date().toISOString();
  const t0 = Date.now();
  const before = await violationCount("a");
  const [n] = await playAndWait([[2, "talking"]]);
  const inc = await incidentsSince(2, since);
  const after = await violationCount("a");
  const pushed = wsIncidents(2, t0);
  const ok = inc.length === 1 && inc[0].status === "CONFIRMED" && inc[0].category === "Loud Conversation" && inc[0].bulb_triggered && after === before + 1 && pushed.length === 1 && n.stats.criticalSeen;
  record(
    "S3",
    "Sustained loud talking (~85 dB, 18 s)",
    "Violation logged, strike, live dashboard update",
    `${fmtInc(inc)} (top_class ${inc[0]?.top_class}, ${inc[0]?.duration_seconds}s, peak ${inc[0]?.peak_db}); strikes ${before}->${after}; WS incident:created x${pushed.length}; node critical LED ${n.stats.criticalSeen ? "ON" : "off"}; ML clips ${n.stats.audio}`,
    ok
  );
}

async function sShoutMusic() {
  const since = new Date().toISOString();
  const b0 = await violationCount("b");
  const c0 = await violationCount("c");
  const [nb, nc] = await playAndWait([[3, "shouting"], [4, "music"]]);
  const ib = await incidentsSince(3, since);
  const ic = await incidentsSince(4, since);
  const b1 = await violationCount("b");
  const c1 = await violationCount("c");
  record(
    "S4a",
    "Sustained shouting (~92 dB, max level)",
    "Violation + strike; critical indicator at max level",
    `${fmtInc(ib)} (top ${ib[0]?.top_class}); strikes ${b0}->${b1}; node LEDs ${nb.stats.maxRed} red, critical ${nb.stats.criticalSeen ? "ON" : "off"}`,
    ib.length === 1 && ib[0].status === "CONFIRMED" && ib[0].category === "Loud Conversation" && b1 === b0 + 1 && nb.stats.criticalSeen && nb.stats.maxRed === 2
  );
  record(
    "S4b",
    "Music from a speaker (~88 dB, 18 s)",
    "Violation + strike; critical indicator",
    `${fmtInc(ic)} (top ${ic[0]?.top_class}); strikes ${c0}->${c1}; node critical ${nc.stats.criticalSeen ? "ON" : "off"}`,
    ic.length === 1 && ic[0].status === "CONFIRMED" && ic[0].category === "Music" && c1 === c0 + 1 && nc.stats.criticalSeen
  );
}

async function sPhone() {
  const since = new Date().toISOString();
  const e0 = await violationCount("e");
  const [n] = await playAndWait([[1, "phone"]]);
  const inc = await incidentsSince(1, since);
  const e1 = await violationCount("e");
  record(
    "S4c",
    "Phone ringing (~80 dB, 8 s; 4 s phone rule)",
    "Violation + strike (phone needs only 4 s once a confident phone label arrives)",
    `${fmtInc(inc)} (top ${inc[0]?.top_class}, ${inc[0]?.duration_seconds}s); strikes ${e0}->${e1}; critical ${n.stats.criticalSeen ? "ON" : "off"}`,
    inc.length === 1 && inc[0].status === "CONFIRMED" && inc[0].category === "Mobile Phone Noise" && e1 === e0 + 1
  );
}

async function sFalseViolations() {
  const since = new Date().toISOString();
  const d0 = await violationCount("d");
  const [nf, nt, nh] = await playAndWait([[5, "false_mix"], [3, "truck"], [4, "horn"]]);
  const i5 = await incidentsSince(5, since);
  const i3 = await incidentsSince(3, since);
  const i4 = await incidentsSince(4, since);
  const d1 = await violationCount("d");
  record(
    "S5a",
    "Door slam / chair scrape / cough / dropped object (each 1-2 s)",
    "Not logged as violation, no strike, no critical indicator",
    `${fmtInc(i5)}; strikes ${d0}->${d1}; red LEDs max ${nf.stats.maxRed} (level meter), critical ${nf.stats.criticalSeen ? "ON" : "off"}`,
    i5.length === 0 && d1 === d0 && !nf.stats.criticalSeen
  );
  record("S5b", "Truck passing on the highway (~7 s, peak ~80 dB)", "No event, no strike (stopped by the duration threshold)", `${fmtInc(i3)}; critical ${nt.stats.criticalSeen ? "ON" : "off"}`, i3.length === 0 && !nt.stats.criticalSeen);
  record("S5c", "Car horn (2 s at ~88 dB)", "No event, no strike", `${fmtInc(i4)}; critical ${nh.stats.criticalSeen ? "ON" : "off"}`, i4.length === 0 && !nh.stats.criticalSeen);

  const since2 = new Date().toISOString();
  const b0 = await violationCount("b");
  const c0 = await violationCount("c");
  const [nc, nj, nm] = await playAndWait([[3, "construction"], [4, "traffic_jam"], [5, "mumble"]], { after: 14000 });
  const ic = await incidentsSince(3, since2);
  const ij = await incidentsSince(4, since2);
  const im = await incidentsSince(5, since2);
  const b1 = await violationCount("b");
  const c1 = await violationCount("c");
  record(
    "S5d",
    "Sustained hammering (~82 dB, 15 s): loud but not a violation sound",
    "Logged for review only (IGNORED), no strike, no critical indicator",
    `${fmtInc(ic)} (top ${ic[0]?.top_class}); strikes ${b0}->${b1}; critical ${nc.stats.criticalSeen ? "ON" : "off"}`,
    ic.length === 1 && ic[0].status === "IGNORED" && ic[0].filter_reason === "non_violation_category" && !ic[0].bulb_triggered && b1 === b0 && !nc.stats.criticalSeen
  );
  record(
    "S5e",
    "Sustained horns/traffic jam (~79 dB, 15 s)",
    "IGNORED (street noise), no strike, no critical indicator",
    `${fmtInc(ij)} (top ${ij[0]?.top_class}); strikes ${c0}->${c1}; critical ${nj.stats.criticalSeen ? "ON" : "off"}`,
    ij.length === 1 && ij[0].status === "IGNORED" && c1 === c0 && !nj.stats.criticalSeen
  );
  record(
    "S5f",
    "Sustained talking the classifier is unsure about (confidence 0.31)",
    "UNVERIFIED (low_confidence), no strike",
    `${fmtInc(im)}; critical ${nm.stats.criticalSeen ? "ON" : "off"}`,
    im.length === 1 && im[0].status === "UNVERIFIED" && im[0].filter_reason === "low_confidence" && !nm.stats.criticalSeen
  );
}

async function sMlDown() {
  ml.setMode("down");
  const since = new Date().toISOString();
  const e0 = await violationCount("e");
  const [n] = await playAndWait([[1, "talking"]]);
  const inc = await incidentsSince(1, since);
  const e1 = await violationCount("e");
  const status = await api("GET", "/api/system/status", { token: adminToken });
  ml.setMode("up");
  record(
    "S6",
    "ML service down + sustained loud talking",
    "Event logged as UNVERIFIED, no strike",
    `${fmtInc(inc)}; strikes ${e0}->${e1}; critical ${n.stats.criticalSeen ? "ON" : "off"}; /api/system/status ml_service=${status.data?.ml_service}`,
    inc.length === 1 && inc[0].status === "UNVERIFIED" && inc[0].filter_reason === "no_classification" && e1 === e0 && !n.stats.criticalSeen && status.data?.ml_service === "offline"
  );
}

async function sRepeatOffender() {
  // a) same day: the daily cap (MAX_STRIKES_PER_DAY=1) stops a 2nd strike
  const since = new Date().toISOString();
  const a0 = await violationCount("a");
  await playAndWait([[2, "talking"]]);
  const inc = await incidentsSince(2, since);
  const a1 = await violationCount("a");
  record(
    "S7a",
    "Repeat offender, same day (2nd loud talking)",
    "Incident CONFIRMED, but no 2nd strike within 24 h (daily cap)",
    `${fmtInc(inc)}; strikes ${a0}->${a1}`,
    inc.length === 1 && inc[0].status === "CONFIRMED" && a1 === a0
  );

  // b) earlier strikes on earlier days, then a 3rd: ban
  await q("UPDATE violations SET created_at = NOW() - INTERVAL '50 hours' WHERE occupant_id = $1", [occupants.a.id]);
  const [old] = await q(
    `INSERT INTO incidents (table_id, occupant_id, category, db_level, status, occurred_at, created_at)
     VALUES ($1, $2, 'Loud Conversation', 84, 'CONFIRMED', NOW() - INTERVAL '26 hours', NOW() - INTERVAL '26 hours') RETURNING id`,
    [tables[2].id, occupants.a.id]
  );
  await q(
    `INSERT INTO violations (occupant_id, incident_id, table_id, violation_number, created_at)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(violation_number),0)+1 FROM violations WHERE occupant_id = $1), NOW() - INTERVAL '26 hours')`,
    [occupants.a.id, old.id, tables[2].id]
  );
  const before = (await api("GET", `/api/occupants/${occupants.a.id}`, { token: adminToken })).data;
  const since2 = new Date().toISOString();
  await playAndWait([[2, "talking"]]);
  const inc2 = await incidentsSince(2, since2);
  const occ = (await api("GET", `/api/occupants/${occupants.a.id}`, { token: adminToken })).data;
  const o = occ?.occupant || occ;
  const t2 = await tableNow(2);
  const login = await api("POST", "/api/client/login", { body: { email: occupants.a.email, password: secrets.clientPassword } });
  const profile = await api("GET", "/api/client/profile", { token: login.data?.token });
  const p = profile.data?.client || profile.data;
  const days = o?.ban_until ? (new Date(o.ban_until) - Date.now()) / 86400000 : null;
  record(
    "S7b",
    "Repeat offender: 2 strikes on earlier days + a 3rd today",
    "3rd strike bans for one week and releases the seat",
    `${fmtInc(inc2)}; strikes before ${(before?.occupant || before)?.strikes} -> status ${o?.status}, ban ${days?.toFixed(1)} days, table 2 occupant ${t2.occupant ? t2.occupant.full_name : "none"}; client portal shows ${p?.status}`,
    inc2.length === 1 && o?.status === "BANNED" && days > 6.9 && days < 7.1 && !t2.occupant && p?.status === "BANNED"
  );
}

async function sFiveNodes() {
  await seat("f", 2); // A was banned and released
  const since = new Date().toISOString();
  const plan = [[1, "quiet"], [2, "talking"], [3, "false_mix"], [4, "music"], [5, "traffic_jam"]];
  const nodes = await playAndWait(plan, { after: 12000 });
  const got = {};
  for (const [t] of plan) got[t] = await incidentsSince(t, since);
  const ok =
    got[1].length === 0 &&
    got[2].length === 1 && got[2][0].category === "Loud Conversation" && got[2][0].occupant?.id === occupants.f.id &&
    got[3].length === 0 &&
    got[4].length === 1 && got[4][0].category === "Music" && got[4][0].occupant?.id === occupants.c.id &&
    got[5].length === 1 && got[5][0].status === "IGNORED" && got[5][0].top_class === "Traffic noise, roadway noise";
  const counts = [];
  for (const [t] of plan) counts.push((await q("SELECT COUNT(*)::int AS n FROM noise_readings WHERE table_id = $1 AND created_at >= $2", [tables[t].id, since]))[0].n);
  record(
    "S8",
    "5 nodes at once (quiet / talking / false sounds / music / traffic)",
    "Each table tracked separately, no node mix-ups",
    plan.map(([t, s], i) => `T${t} ${s}: ${fmtInc(got[t])}${got[t][0]?.top_class ? ` [${got[t][0].top_class}]` : ""} (${counts[i]} readings, node sent ${nodes[i].stats.telemetry})`).join("; "),
    ok && counts.every((c, i) => c === nodes[i].stats.telemetry)
  );
}

async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  return null;
}

async function sOffline() {
  const t0 = Date.now();
  let node = play(3, "quiet", { seconds: 0 });
  const online1 = await waitFor(async () => (await tableNow(3)).is_online, 8000);
  await node.stop({ abrupt: true }); // power cut: broker sends the Last Will
  const tCut = Date.now();
  const offline = await waitFor(async () => !(await tableNow(3)).is_online, 8000);
  const offlineAfter = ((Date.now() - tCut) / 1000).toFixed(1);
  const wsOffline = wsUpdates(3, tCut).some(m => !m.table.is_online);
  node = play(3, "quiet", { seconds: 0 });
  const online2 = await waitFor(async () => (await tableNow(3)).is_online, 8000);

  // A node that freezes (connection still open, no readings): only the
  // 15 s heartbeat sweep can notice.
  node.hang();
  const tHang = Date.now();
  const offline2 = await waitFor(async () => !(await tableNow(3)).is_online, 40000);
  const hangAfter = ((Date.now() - tHang) / 1000).toFixed(0);
  node.resume();
  const online3 = await waitFor(async () => (await tableNow(3)).is_online, 8000);
  await node.stop({ abrupt: false });
  const alive = (await api("GET", "/health")).status === 200;
  record(
    "S9",
    "Node goes offline then back (power cut via Last Will, then a frozen node)",
    "Dashboard shows offline/online correctly, no crash",
    `online ${Boolean(online1)}; power cut -> offline after ${offlineAfter}s (WS update ${wsOffline}); back online ${Boolean(online2)}; frozen -> offline after ~${hangAfter}s (sweep); back ${Boolean(online3)}; API alive ${alive}`,
    Boolean(online1 && offline && wsOffline && online2 && offline2 && online3 && alive),
    `started ${new Date(t0).toISOString()}`
  );
}

async function sMalformed() {
  const marker = serverLog.length;
  const since = new Date().toISOString();
  const raw = mqtt.connect(broker.url, { clientId: `sim-attacker-${Date.now()}` });
  await new Promise(r => raw.once("connect", r));
  const pub = (topic, payload) => new Promise(r => raw.publish(topic, payload, { qos: 1 }, r));
  await pub("enoise/NODE-001/telemetry", "not json");
  await pub("enoise/NODE-001/telemetry", '{"db_level":"abc"}');
  await pub("enoise/NODE-001/telemetry", '{"db_level":999}');
  await pub("enoise/NODE-001/telemetry", "{}");
  await pub("enoise/NODE-001/telemetry", "null");
  await pub("enoise/NODE-999/telemetry", '{"db_level":61.2}');
  await pub("enoise/NODE-001/status", "garbage");
  await pub("enoise/NODE-001/audio", Buffer.from("definitely not a wav file"));
  await pub("enoise/NODE-001/audio", buildWav({ label: "shouting" })); // valid WAV nobody asked for
  await pub("enoise/NODE-001/telemetry/extra", '{"db_level":70}');
  await sleep(2500);
  raw.end();
  const log = serverLog.slice(marker);
  const badTelemetry = (log.match(/Bad telemetry from NODE-001/g) || []).length;
  const unknown = log.includes('No table registered for sensor_node_id "NODE-999"');
  const badStatus = log.includes("Bad status from NODE-001");
  const nonWav = log.includes("Ignoring non-WAV audio payload from NODE-001");
  const unrequested = log.includes("Ignoring unrequested audio clip from NODE-001");
  const rows = (await q("SELECT COUNT(*)::int AS n FROM noise_readings WHERE table_id = $1 AND created_at >= $2", [tables[1].id, since]))[0].n;
  const ghost = (await q("SELECT COUNT(*)::int AS n FROM tables WHERE sensor_node_id = 'NODE-999'"))[0].n;
  const alive = (await api("GET", "/health")).status === 200;
  record(
    "S10",
    "Malformed payloads, unknown node ID, unrequested audio",
    "Rejected and logged, server keeps running",
    `${badTelemetry}/5 bad telemetry logged; unknown NODE-999 logged ${unknown}; bad status logged ${badStatus}; non-WAV dropped ${nonWav}; unrequested WAV dropped ${unrequested}; readings stored ${rows}; NODE-999 table created ${ghost > 0}; API alive ${alive}`,
    badTelemetry === 5 && unknown && badStatus && nonWav && unrequested && rows === 0 && ghost === 0 && alive
  );
}

async function sRestart() {
  const node = play(1, "quiet", { seconds: 0 });
  await sleep(5000);
  const connectedBefore = ws.messages.filter(m => m.type === "connected").length;
  await stopServer();
  const tDown = new Date().toISOString();
  await sleep(4000);
  const healthDown = await api("GET", "/health").then(r => r.status).catch(() => "no answer");
  const marker = await startServer(ml.url);
  const tUp = new Date().toISOString();
  await sleep(8000);
  const log = serverLog.slice(marker);
  const after = (await q("SELECT COUNT(*)::int AS n FROM noise_readings WHERE table_id = $1 AND created_at >= $2", [tables[1].id, tUp]))[0].n;
  const reconnected = ws.messages.filter(m => m.type === "connected").length > connectedBefore;
  const online = (await tableNow(1)).is_online;
  await node.stop({ abrupt: false });
  record(
    "S11",
    "API killed mid-stream and restarted",
    "Recovers, reconnects to the broker, keeps ingesting",
    `while down: /health ${healthDown}; after restart: MQTT subscribed ${log.includes("[mqtt] Subscribed")}, ${after} new readings in 8 s, dashboard WebSocket reconnected ${reconnected}, table online ${online}`,
    log.includes("[mqtt] Subscribed") && after >= 5 && reconnected && online,
    `down at ${tDown}, up at ${tUp}. Readings sent while the API was down are lost (no persistent MQTT session).`
  );
}

async function sRetention() {
  const g = occupants.g.id;
  const t6 = tables[6].id;
  const mk = async days => {
    const [inc] = await q(
      `INSERT INTO incidents (table_id, occupant_id, category, db_level, status, occurred_at, created_at)
       VALUES ($1, $2, 'Loud Conversation', 80, 'CONFIRMED', NOW() - make_interval(days => $3), NOW() - make_interval(days => $3)) RETURNING id`,
      [t6, g, days]
    );
    const [v] = await q(
      `INSERT INTO violations (occupant_id, incident_id, table_id, violation_number, created_at)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(violation_number),0)+1 FROM violations WHERE occupant_id = $1), NOW() - make_interval(days => $4)) RETURNING id`,
      [g, inc.id, t6, days]
    );
    return { incident: inc.id, violation: v.id };
  };
  const old = await mk(31);
  const recent = await mk(29);
  const [reading] = await q("INSERT INTO noise_readings (table_id, db_level, recorded_at) VALUES ($1, 61, NOW() - INTERVAL '8 days') RETURNING id", [t6]);
  const [seatRow] = await q(
    "INSERT INTO table_assignments (table_id, occupant_id, assigned_at, released_at) VALUES ($1, $2, NOW() - INTERVAL '40 days', NOW() - INTERVAL '31 days') RETURNING id",
    [tables[7].id, occupants.b.id]
  );
  // The cleanup runs at every API start (and every 24 h). Restart = a Render wake-up.
  await stopServer();
  await startServer(ml.url);
  await sleep(2000);
  const exists = async (table, id) => (await q(`SELECT COUNT(*)::int AS n FROM ${table} WHERE id = $1`, [id]))[0].n === 1;
  const oldGone = !(await exists("violations", old.violation));
  const recentKept = await exists("violations", recent.violation);
  const [oldInc] = await q("SELECT occupant_id FROM incidents WHERE id = $1", [old.incident]);
  const readingGone = !(await exists("noise_readings", reading.id));
  const seatGone = !(await exists("table_assignments", seatRow.id));
  record(
    "S12",
    "Records older than 30 days",
    "Removed by the retention cleanup",
    `31-day violation deleted ${oldGone}; 29-day violation kept ${recentKept}; 31-day incident unlinked from occupant ${oldInc?.occupant_id === null}; 8-day raw reading deleted ${readingGone}; 31-day released seat record deleted ${seatGone}`,
    oldGone && recentKept && oldInc?.occupant_id === null && readingGone && seatGone,
    "Cleanup runs at API start-up and every 24 h after that (and every hour for raw readings)."
  );
}

// ---------------------------------------------------------------------------
function writeReport() {
  const icon = p => (p === true ? "PASS" : p === false ? "FAIL" : "NOTE");
  const lines = [
    "# Simulator run",
    "",
    `Run at ${new Date().toISOString()} against a throwaway local database (\`${SIM_DB}\`), a local aedes broker and mock-ml.js.`,
    `Thresholds on tables 1-5: warning ${STUDIFY.warning_threshold} / critical ${STUDIFY.critical_threshold} dB, ${STUDIFY.confirmation_seconds} s. Test-only: VIOLATION_COOLDOWN_SECONDS=${COOLDOWN_SECONDS}.`,
    "",
    "| # | Scenario | Expected | Actual | Result |",
    "|---|---|---|---|---|",
    ...results.map(r => `| ${r.id} | ${r.scenario} | ${r.expected} | ${String(r.actual).replace(/\|/g, "/")} | ${icon(r.pass)} |`),
    "",
    `Passed ${results.filter(r => r.pass === true).length} of ${results.length}.`,
    "",
    "## Details",
    "",
    ...results.filter(r => r.evidence).map(r => `**${r.id}**\n\n\`\`\`\n${r.evidence}\n\`\`\`\n`)
  ];
  fs.writeFileSync(path.join(RESULTS_DIR, "latest.md"), lines.join("\n"));
  fs.writeFileSync(path.join(RESULTS_DIR, "latest.json"), JSON.stringify(results, null, 2));
}

async function main() {
  console.log(`[sim] Re-creating ${SIM_DB} on ${pgHost} and running migrations...`);
  await recreateDatabase();
  console.log((await runNode(path.join(SERVER_DIR, "db/migrate.js"), { DATABASE_URL: `${PG_BASE}/${SIM_DB}` })).trim().split("\n").slice(-1)[0]);
  // The 7 Studify tables (NODE-001..007, default thresholds, table 7 PAUSED).
  console.log((await runNode(path.join(SERVER_DIR, "db/seed-tables.js"), { DATABASE_URL: `${PG_BASE}/${SIM_DB}` })).trim().split("\n").slice(-1)[0]);

  broker = await startBroker({ port: PORTS.broker, quiet: true });
  ml = await startMockMl({ port: PORTS.ml, key: secrets.mlKey, quiet: true });
  await startServer(ml.url);
  console.log(`[sim] API on ${API}, broker ${broker.url}, mock ML ${ml.url}. Server log: results/server.log`);

  try {
    await smoke();
    if (!adminToken) throw new Error("No admin token; stopping.");
    await setupTables();
    ws = watch(API, adminToken);
    await sleep(1000);

    if (want("quiet")) await sQuietAndSeedThresholds();
    if (want("spike")) await sSpike();
    if (want("talking")) await sTalking();
    if (want("shout")) await sShoutMusic();
    if (want("phone")) await sPhone();
    if (want("false")) await sFalseViolations();
    if (want("mldown")) await sMlDown();
    if (want("repeat")) await sRepeatOffender();
    if (want("five")) await sFiveNodes();
    if (want("offline")) await sOffline();
    if (want("malformed")) await sMalformed();
    if (want("restart")) await sRestart();
    if (want("retention")) await sRetention();
  } catch (err) {
    record("ERR", "runner", "-", `stopped: ${err.message}${err.cause ? ` (${err.cause.code || err.cause.message})` : ""}`, false, err.stack);
  } finally {
    writeReport();
    ws?.close();
    await within(Promise.all([...liveNodes].map(n => n.stop({ abrupt: false }))), 3000);
    await within(stopServer(), 5000);
    await within(ml.close(), 3000);
    await within(broker.close(), 3000);
    await within(db.end(), 3000);
  }
  const failed = results.filter(r => r.pass === false).length;
  console.log(`\n[sim] ${results.length - failed}/${results.length} passed. Report: tools/simulator/results/latest.md`);
  process.exit(0);
}

main();
