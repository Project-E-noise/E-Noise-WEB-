// Phase 7: audio clips are only accepted shortly after they were requested,
// production refuses to start with an ML service but no key, and admin
// sessions can be revoked (token_version) and last one day.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import jwt from "jsonwebtoken";
import { api, resetDatabase, closeDatabase, createAdmin, createTable, bearer, query } from "./helpers.js";
import { startFakeMl, fakeWav } from "./fake-ml.js";
import { ingestTelemetry, ingestAudioClip, AUDIO_ACCEPT_WINDOW_SECONDS } from "../src/services/telemetryService.js";
import { env } from "../src/config/env.js";
import { resetMlHealth } from "../src/services/mlClient.js";
import { signSession } from "../src/utils/tokens.js";

let fakeMl;
before(async () => {
  await resetDatabase();
  fakeMl = await startFakeMl();
});
after(async () => {
  await fakeMl.close();
  await closeDatabase();
});
beforeEach(() => {
  env.mlServiceUrl = fakeMl.url;
  resetMlHealth();
});

const status = async tableId => (await query("SELECT * FROM sensor_status WHERE table_id = $1", [tableId])).rows[0];

test("an audio clip is only accepted within 10 s of an audio request", async () => {
  assert.equal(AUDIO_ACCEPT_WINDOW_SECONDS, 10);
  const table = await createTable({ sensor_node_id: "NODE-AUD" });
  const before = fakeMl.requests.length;

  // Never asked: dropped without even calling the ML service.
  await ingestAudioClip("NODE-AUD", fakeWav());
  assert.equal(fakeMl.requests.length, before, "unsolicited clip is not classified");
  assert.equal((await status(table.id)).classification, null);

  // Asked 30 s ago: too old.
  await query("UPDATE sensor_status SET last_audio_requested_at = NOW() - INTERVAL '30 seconds' WHERE table_id = $1", [table.id]);
  await ingestAudioClip("NODE-AUD", fakeWav());
  assert.equal(fakeMl.requests.length, before, "stale request does not count");

  // A loud reading requests audio now: the clip is accepted.
  await ingestTelemetry("NODE-AUD", { db_level: 70 });
  await ingestAudioClip("NODE-AUD", fakeWav());
  assert.equal(fakeMl.requests.length, before + 1);
  assert.equal((await status(table.id)).classification, "Loud Conversation");
});

// Starts env.js in a child process with the given variables and returns
// { ok, stderr }. Run from the temp folder so server/.env isn't loaded.
function boot(vars) {
  const childEnv = { ...process.env, NODE_ENV: "production", JWT_SECRET: "x".repeat(40), DATABASE_URL: "postgresql://u:p@localhost/db", ...vars };
  for (const key of Object.keys(vars)) if (vars[key] === undefined) delete childEnv[key];
  try {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", "const { env } = await import(process.argv[1]); console.log(JSON.stringify({ url: env.mlServiceUrl, key: env.mlApiKey }));", new URL("../src/config/env.js", import.meta.url).href], {
      env: childEnv, cwd: tmpdir(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, out: JSON.parse(out.trim()) };
  } catch (err) {
    return { ok: false, stderr: String(err.stderr) };
  }
}

test("production refuses to start when ML_SERVICE_URL is set but ML_API_KEY is empty", () => {
  const refused = boot({ ML_SERVICE_URL: "https://ml.example.com", ML_API_KEY: "" });
  assert.equal(refused.ok, false);
  assert.match(refused.stderr, /ML_API_KEY/);

  const withKey = boot({ ML_SERVICE_URL: "https://ml.example.com/", ML_API_KEY: "secret" });
  assert.equal(withKey.ok, true);
  assert.equal(withKey.out.url, "https://ml.example.com");

  const noMl = boot({ ML_SERVICE_URL: undefined, ML_API_KEY: undefined });
  assert.equal(noMl.ok, true);
  assert.equal(noMl.out.url, null, "no ML service in production unless configured");
});

test("logout revokes the admin's sessions (token_version)", async () => {
  const admin = await createAdmin();
  assert.equal((await api().get("/api/auth/me").set(bearer(admin.token))).status, 200);

  const logout = await api().post("/api/auth/logout").set(bearer(admin.token));
  assert.equal(logout.status, 200);
  const after = await api().get("/api/auth/me").set(bearer(admin.token));
  assert.equal(after.status, 401, "the old token no longer works");

  const login = await api().post("/api/auth/login").send({ email: admin.email, password: admin.password });
  assert.equal(login.status, 200);
  assert.equal((await api().get("/api/auth/me").set(bearer(login.body.token))).status, 200, "a fresh login works");
});

test("a token with an old version is rejected", async () => {
  const admin = await createAdmin();
  await query("UPDATE admins SET token_version = token_version + 1 WHERE id = $1", [admin.id]);
  assert.equal((await api().get("/api/auth/me").set(bearer(admin.token))).status, 401);
  const current = signSession(admin.id, "admin", { version: 1 });
  assert.equal((await api().get("/api/auth/me").set(bearer(current))).status, 200);
});

test("admin sessions last one day; client sessions keep JWT_EXPIRES_IN", async () => {
  const admin = await createAdmin();
  const login = await api().post("/api/auth/login").send({ email: admin.email, password: admin.password });
  const payload = jwt.decode(login.body.token);
  const seconds = payload.exp - payload.iat;
  assert.equal(seconds, 24 * 60 * 60);
  assert.equal(payload.tv, 0);

  const client = jwt.decode(signSession(1, "client"));
  assert.equal(client.exp - client.iat, 7 * 24 * 60 * 60);
  assert.equal(client.tv, undefined, "clients have no token_version");
});
