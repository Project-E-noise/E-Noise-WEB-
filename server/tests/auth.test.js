// Admin registration (invite code), email verification, login, profile.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, testOutbox, query, createAdmin, bearer } from "./helpers.js";

before(resetDatabase);
after(closeDatabase);

const good = { full_name: "Ana Admin", email: "Ana@Example.com", password: "Password123", invite_code: "letmein-test" };

function tokenFromOutbox() {
  const last = testOutbox.at(-1);
  return /token=([a-f0-9]+)/.exec(last.text)[1];
}

test("register needs the invite code", async () => {
  const missing = await api().post("/api/auth/register").send({ ...good, invite_code: undefined });
  assert.equal(missing.status, 403);
  const wrong = await api().post("/api/auth/register").send({ ...good, invite_code: "nope" });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error, "The invite code is not correct.");
});

test("register validates fields", async () => {
  const cases = [
    [{ full_name: "" }, /Full name is required/],
    [{ full_name: "x".repeat(101) }, /100 characters/],
    [{ email: "not-an-email" }, /valid email/],
    [{ password: "short" }, /at least 8/],
    [{ password: "é".repeat(40) }, /72 bytes/],
    [{ full_name: 123 }, /Full name is required/]
  ];
  for (const [change, message] of cases) {
    const res = await api().post("/api/auth/register").send({ ...good, ...change });
    assert.equal(res.status, 400, JSON.stringify(change));
    assert.match(res.body.error, message);
  }
});

test("register -> verify -> login flow", async () => {
  const res = await api().post("/api/auth/register").send(good);
  assert.equal(res.status, 201);

  const { rows } = await query("SELECT email, password_hash FROM admins WHERE email = 'ana@example.com'");
  assert.equal(rows.length, 1, "email is stored lowercase");
  assert.match(rows[0].password_hash, /^\$2[aby]\$/, "password is a bcrypt hash");

  const duplicate = await api().post("/api/auth/register").send(good);
  assert.equal(duplicate.status, 409);

  const unverified = await api().post("/api/auth/login").send({ email: good.email, password: good.password });
  assert.equal(unverified.status, 403);

  assert.equal((await api().get("/api/auth/verify-email?token=nope").send()).status, 404);
  const verified = await api().get(`/api/auth/verify-email?token=${tokenFromOutbox()}`);
  assert.equal(verified.status, 200);

  const login = await api().post("/api/auth/login").send({ email: "ana@example.com", password: good.password });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  assert.equal(login.body.admin.password_hash, undefined, "hash is never returned");

  const me = await api().get("/api/auth/me").set(bearer(login.body.token));
  assert.equal(me.status, 200);
  assert.equal(me.body.admin.email, "ana@example.com");
});

test("expired verification links return 410", async () => {
  await api().post("/api/auth/register").send({ ...good, email: "late@example.com" });
  const token = tokenFromOutbox();
  await query("UPDATE admins SET verification_token_expires_at = NOW() - INTERVAL '1 hour' WHERE email = 'late@example.com'");
  const res = await api().get(`/api/auth/verify-email?token=${token}`);
  assert.equal(res.status, 410);
});

test("login rejects wrong password and unknown email with the same message", async () => {
  const admin = await createAdmin();
  const wrong = await api().post("/api/auth/login").send({ email: admin.email, password: "WrongPass1" });
  const unknown = await api().post("/api/auth/login").send({ email: "ghost@test.local", password: "WrongPass1" });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
  const empty = await api().post("/api/auth/login").send({});
  assert.equal(empty.status, 400);
});

test("disabled admins cannot log in or use old tokens", async () => {
  const admin = await createAdmin({ status: "DISABLED" });
  const login = await api().post("/api/auth/login").send({ email: admin.email, password: admin.password });
  assert.equal(login.status, 403);
  const me = await api().get("/api/auth/me").set(bearer(admin.token));
  assert.equal(me.status, 403);
});

test("resend verification always gives the same answer", async () => {
  const a = await api().post("/api/auth/resend-verification").send({ email: "nobody@example.com" });
  const b = await api().post("/api/auth/resend-verification").send({ email: "late@example.com" });
  const c = await api().post("/api/auth/resend-verification").send({ email: 42 });
  assert.equal(a.status, 200);
  assert.equal(a.body.message, b.body.message);
  assert.equal(a.body.message, c.body.message);
});

test("profile update and password change", async () => {
  const admin = await createAdmin();
  const bad = await api().patch("/api/auth/me").set(bearer(admin.token)).send({ full_name: "   " });
  assert.equal(bad.status, 400);
  const ok = await api().patch("/api/auth/me").set(bearer(admin.token)).send({ full_name: "  New Name " });
  assert.equal(ok.body.admin.full_name, "New Name");

  const wrongCurrent = await api().post("/api/auth/change-password").set(bearer(admin.token)).send({ current_password: "nope", new_password: "Another123" });
  assert.equal(wrongCurrent.status, 400);
  const tooShort = await api().post("/api/auth/change-password").set(bearer(admin.token)).send({ current_password: admin.password, new_password: "short" });
  assert.equal(tooShort.status, 400);
  const changed = await api().post("/api/auth/change-password").set(bearer(admin.token)).send({ current_password: admin.password, new_password: "Another123" });
  assert.equal(changed.status, 200);
  const login = await api().post("/api/auth/login").send({ email: admin.email, password: "Another123" });
  assert.equal(login.status, 200);

  const logout = await api().post("/api/auth/logout").set(bearer(admin.token));
  assert.equal(logout.status, 200);
});
