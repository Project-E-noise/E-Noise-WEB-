// In production the API must refuse to start with missing settings, instead
// of silently using localhost defaults. Each case starts src/config/env.js in
// a separate process (it calls process.exit), from a folder with no .env.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const envModule = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/config/env.js")).href;
const complete = {
  NODE_ENV: "production",
  JWT_SECRET: "x".repeat(40),
  DATABASE_URL: "postgresql://user:pw@db.example.com/enoise",
  CORS_ORIGIN: "https://enoise.example.com",
  CLIENT_URL: "https://enoise.example.com"
};

function start(overrides) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...complete, ...overrides };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  return spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(envModule)}); console.log("started");`], {
    cwd: os.tmpdir(),
    env,
    encoding: "utf8"
  });
}

test("production starts when every required setting is there", () => {
  const run = start({});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /started/);
});

for (const name of ["JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN", "CLIENT_URL"]) {
  test(`production refuses to start without ${name}`, () => {
    const run = start({ [name]: undefined });
    assert.equal(run.status, 1);
    assert.match(run.stderr, new RegExp(`in production: ${name}`));
  });
}

test("production refuses a blank CORS_ORIGIN", () => {
  const run = start({ CORS_ORIGIN: "   " });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /CORS_ORIGIN/);
});
