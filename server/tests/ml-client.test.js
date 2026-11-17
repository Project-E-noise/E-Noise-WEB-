// mlClient: forwards clips, keeps top_class, and tracks whether the ML
// service is reachable so the confirmation engine knows whether to wait
// for a label.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startFakeMl, fakeWav } from "./fake-ml.js";

process.env.NODE_ENV = "test";
process.env.ML_SERVICE_URL = "http://127.0.0.1:9";
const { env } = await import("../src/config/env.js");
const { classifyAudioClip, checkMlHealth, isMlServiceUp, mlHealthState, resetMlHealth } = await import("../src/services/mlClient.js");

let fake;
before(async () => {
  fake = await startFakeMl();
});
after(() => fake.close());

test("before any contact the service counts as not up", () => {
  resetMlHealth();
  assert.equal(isMlServiceUp(), false);
  assert.equal(mlHealthState(), "unknown");
});

test("an unreachable service gives null and marks the service down", async () => {
  resetMlHealth();
  env.mlServiceUrl = "http://127.0.0.1:9";
  assert.equal(await classifyAudioClip(fakeWav()), null);
  assert.equal(isMlServiceUp(), false);
  assert.equal(mlHealthState(), "offline");
  assert.equal(await checkMlHealth(), false);
});

test("a good answer includes top_class and marks the service up", async () => {
  resetMlHealth();
  env.mlServiceUrl = fake.url;
  env.mlApiKey = "secret-key";
  const result = await classifyAudioClip(fakeWav());
  assert.deepEqual(result, { category: "Loud Conversation", confidence: 0.9, top_class: "Speech" });
  assert.equal(isMlServiceUp(), true);
  assert.equal(mlHealthState(), "online");
  const sent = fake.requests.at(-1);
  assert.equal(sent.headers["x-api-key"], "secret-key");
  assert.equal(sent.headers["content-type"], "audio/wav");
});

test("Music is an accepted category; an unknown one is rejected but the service still counts as up", async () => {
  env.mlServiceUrl = fake.url;
  fake.setResponse(() => ({ category: "Music", confidence: 0.75, top_class: "Guitar" }));
  assert.deepEqual(await classifyAudioClip(fakeWav()), { category: "Music", confidence: 0.75, top_class: "Guitar" });
  fake.setResponse(() => ({ category: "Shouting", confidence: 0.75 }));
  assert.equal(await classifyAudioClip(fakeWav()), null);
  assert.equal(isMlServiceUp(), true);
  fake.setResponse(() => ({ category: "Music", confidence: 0.75 }));
  assert.deepEqual(await classifyAudioClip(fakeWav()), { category: "Music", confidence: 0.75, top_class: null }, "top_class is optional");
});

test("a 5xx answer marks the service down; /health brings it back", async () => {
  env.mlServiceUrl = fake.url;
  fake.setResponse(() => 503);
  assert.equal(await classifyAudioClip(fakeWav()), null);
  assert.equal(isMlServiceUp(), false);
  assert.equal(await checkMlHealth(), true);
  assert.equal(isMlServiceUp(), true);
});

test("no ML_SERVICE_URL means not configured and never up", async () => {
  resetMlHealth();
  env.mlServiceUrl = null;
  assert.equal(mlHealthState(), "not_configured");
  assert.equal(await classifyAudioClip(fakeWav()), null);
  assert.equal(await checkMlHealth(), false);
  assert.equal(isMlServiceUp(), false);
  env.mlServiceUrl = fake.url;
});
