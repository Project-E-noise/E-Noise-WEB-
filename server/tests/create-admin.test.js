// scripts/create-admin.js (npm run admin:create): the fallback when the
// verification email can't be delivered.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, pool, query, resetDatabase, closeDatabase, createAdmin } from "./helpers.js";
import { createVerifiedAdmin } from "../scripts/create-admin.js";

before(resetDatabase);
after(closeDatabase);

async function run(details) {
  const client = await pool.connect();
  try {
    return await createVerifiedAdmin(client, details);
  } finally {
    client.release();
  }
}

test("creates a verified admin who can sign in at once", async () => {
  const result = await run({ fullName: "First Admin", email: " First.Admin@Example.com ", password: "Str0ng-pass" });
  assert.equal(result.action, "created");
  const login = await api().post("/api/auth/login").send({ email: "first.admin@example.com", password: "Str0ng-pass" });
  assert.equal(login.status, 200);
  const { rows } = await query("SELECT password_hash FROM admins WHERE id = $1", [result.id]);
  assert.notEqual(rows[0].password_hash, "Str0ng-pass");
  assert.match(rows[0].password_hash, /^\$2[aby]\$10\$/);
});

test("verifies an admin who registered but never got the email, and signs out old sessions", async () => {
  const pending = await createAdmin({ verified: false });
  assert.equal((await api().post("/api/auth/login").send({ email: pending.email, password: pending.password })).status, 403);
  const result = await run({ fullName: "Ignored", email: pending.email, password: "New-pass-123" });
  assert.equal(result.action, "updated");
  assert.equal((await api().post("/api/auth/login").send({ email: pending.email, password: "New-pass-123" })).status, 200);
  const { rows } = await query("SELECT token_version, status FROM admins WHERE id = $1", [pending.id]);
  assert.equal(rows[0].token_version, 1);
  assert.equal(rows[0].status, "VERIFIED");
});

test("a disabled admin stays disabled; bad input changes nothing", async () => {
  const disabled = await createAdmin({ status: "DISABLED" });
  const result = await run({ fullName: "X", email: disabled.email, password: "Another-pass-1" });
  assert.equal(result.disabled, true);
  await assert.rejects(run({ fullName: "Y", email: "not-an-email", password: "Long-enough-1" }), /valid email/);
  await assert.rejects(run({ fullName: "Y", email: "short@example.com", password: "short" }), /at least 8/);
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM admins WHERE email = 'short@example.com'");
  assert.equal(rows[0].n, 0);
});
