// General API behaviour: health check, JSON errors, security headers, CORS.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, resetDatabase, closeDatabase, createAdmin, bearer } from "./helpers.js";

let admin;
before(async () => {
  await resetDatabase();
  admin = await createAdmin();
});
after(closeDatabase);

test("GET /health works without a database call", async () => {
  const res = await api().get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("unknown routes return a JSON 404 { error }", async () => {
  const res = await api().get("/api/nope");
  assert.equal(res.status, 404);
  assert.match(res.body.error, /No route/);
});

test("malformed JSON returns 400, not 500", async () => {
  const res = await api().post("/api/auth/login").set("Content-Type", "application/json").send("{bad json");
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "Request body must be valid JSON.");
});

test("a non-numeric id returns 400 with a friendly message", async () => {
  const res = await api().get("/api/tables/abc").set(bearer(admin.token));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Table id must be a positive whole number/);
});

test("helmet security headers are set and x-powered-by is hidden", async () => {
  const res = await api().get("/health");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.ok(res.headers["strict-transport-security"]);
  assert.equal(res.headers["x-powered-by"], undefined);
});

test("CORS allows configured origins (including * patterns) and blocks others", async () => {
  const ok = await api().get("/health").set("Origin", "http://localhost:5173");
  assert.equal(ok.headers["access-control-allow-origin"], "http://localhost:5173");

  const preview = await api().get("/health").set("Origin", "https://enoise-git-feature-abc.vercel.app");
  assert.equal(preview.headers["access-control-allow-origin"], "https://enoise-git-feature-abc.vercel.app");

  const evil = await api().get("/health").set("Origin", "https://evil.example.com");
  assert.equal(evil.headers["access-control-allow-origin"], undefined);
  assert.equal(evil.status, 200); // no crash, just no CORS header
});

test("rate limit headers are sent on login", async () => {
  const res = await api().post("/api/auth/login").send({ email: "x@y.z", password: "whatever1" });
  assert.ok(res.headers.ratelimit || res.headers["ratelimit-policy"]);
});
