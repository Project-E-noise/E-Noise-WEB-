// Client portal: register -> setup link -> set password -> login -> profile and lists.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, testOutbox, query, createOccupant, bearer } from "./helpers.js";

before(resetDatabase);
after(closeDatabase);

const setupToken = () => /token=([a-f0-9]+)/.exec(testOutbox.at(-1).text)[1];

test("register validates input but never reveals whether an email exists", async () => {
  assert.equal((await api().post("/api/client/register").send({ full_name: "X", email: "bad" })).status, 400);
  assert.equal((await api().post("/api/client/register").send({ full_name: "", email: "x@y.com" })).status, 400);
  assert.equal((await api().post("/api/client/register").send({ full_name: "X", email: "x@y.com", contact: "1".repeat(101) })).status, 400);

  const first = await api().post("/api/client/register").send({ full_name: "Maria", email: "maria@example.com" });
  const second = await api().post("/api/client/register").send({ full_name: "Someone Else", email: "MARIA@example.com" });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.message, second.body.message);
  const { rows } = await query("SELECT full_name, password_hash FROM occupants WHERE email = 'maria@example.com'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, "Maria", "a second registration doesn't rename the record");
  assert.equal(rows[0].password_hash, null, "no password until the link is used");
});

test("setup link: check, set password (once), then login", async () => {
  const token = setupToken();
  assert.equal((await api().get("/api/client/verify-email?token=nope")).status, 404);
  const check = await api().get(`/api/client/verify-email?token=${token}`);
  assert.deepEqual(check.body, { valid: true });

  assert.equal((await api().post("/api/client/set-password").send({ token, password: "short" })).status, 400);
  const set = await api().post("/api/client/set-password").send({ token, password: "Password123" });
  assert.equal(set.status, 200);
  const again = await api().post("/api/client/set-password").send({ token, password: "Password456" });
  assert.equal(again.status, 404, "link is single-use");

  const { rows } = await query("SELECT password_hash, email_verified FROM occupants WHERE email = 'maria@example.com'");
  assert.match(rows[0].password_hash, /^\$2[aby]\$/, "client password is bcrypt-hashed");
  assert.equal(rows[0].email_verified, true);

  const login = await api().post("/api/client/login").send({ email: "Maria@Example.com", password: "Password123" });
  assert.equal(login.status, 200);
  assert.equal(login.body.client.email, "maria@example.com");
  assert.equal(login.body.client.password_hash, undefined);
  assert.equal(login.body.client.id, undefined, "internal id is not exposed");

  const wrong = await api().post("/api/client/login").send({ email: "maria@example.com", password: "nope12345" });
  assert.equal(wrong.status, 401);
});

test("expired setup links return 410", async () => {
  await api().post("/api/client/register").send({ full_name: "Late", email: "late@example.com" });
  const token = setupToken();
  await query("UPDATE occupants SET verification_token_expires_at = NOW() - INTERVAL '1 minute' WHERE email = 'late@example.com'");
  assert.equal((await api().get(`/api/client/verify-email?token=${token}`)).status, 410);
  assert.equal((await api().post("/api/client/set-password").send({ token, password: "Password123" })).status, 410);
});

test("resend gives the same generic answer", async () => {
  const a = await api().post("/api/client/resend-verification").send({ email: "late@example.com" });
  const b = await api().post("/api/client/resend-verification").send({ email: "unknown@example.com" });
  assert.equal(a.status, 200);
  assert.equal(a.body.message, b.body.message);
});

test("profile update and password change", async () => {
  const c = await createOccupant({ email: "p@test.local", password: "Password123" });
  const profile = await api().get("/api/client/profile").set(bearer(c.token));
  assert.equal(profile.body.client.email, "p@test.local");

  assert.equal((await api().patch("/api/client/profile").set(bearer(c.token)).send({ full_name: "" })).status, 400);
  const updated = await api().patch("/api/client/profile").set(bearer(c.token)).send({ full_name: "Paula", contact: "0917" });
  assert.equal(updated.body.client.full_name, "Paula");
  assert.equal(updated.body.client.contact, "0917");

  assert.equal((await api().post("/api/client/change-password").set(bearer(c.token)).send({ current_password: "bad", new_password: "Password999" })).status, 400);
  assert.equal((await api().post("/api/client/change-password").set(bearer(c.token)).send({ current_password: "Password123", new_password: "Password123" })).status, 400);
  assert.equal((await api().post("/api/client/change-password").set(bearer(c.token)).send({ current_password: "Password123", new_password: "Password999" })).status, 200);
  assert.equal((await api().post("/api/client/login").send({ email: "p@test.local", password: "Password999" })).status, 200);
});

test("log and violation filters are validated", async () => {
  const c = await createOccupant({ email: "f@test.local", password: "Password123" });
  const t = bearer(c.token);
  assert.equal((await api().get("/api/client/logs?from=2026-13-01").set(t)).status, 400);
  assert.equal((await api().get("/api/client/logs?from=2026-05-02&to=2026-05-01").set(t)).status, 400);
  assert.equal((await api().get("/api/client/logs?limit=0").set(t)).status, 400);
  assert.equal((await api().get("/api/client/logs?limit=abc").set(t)).status, 400);
  const ok = await api().get("/api/client/violations?from=2026-01-01&to=2026-12-31&limit=5&offset=0").set(t);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.page_limit, 5);
  assert.equal(ok.body.is_banned, false);
});
