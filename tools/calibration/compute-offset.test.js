// node --test   (from tools/calibration)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { computeCalibration, parseCsv, errorsFor, levelAverages } from "./compute-offset.js";

const load = name => parseCsv(fs.readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8"));

test("a node that reads 4.5 dB low gets a single +4.5 dB offset", () => {
  const r = computeCalibration(load("node-reads-low.csv"));
  assert.equal(r.model.type, "offset");
  assert.ok(Math.abs(r.model.offset - 4.5) < 0.1);
  assert.equal(r.pass, true);
  assert.equal(r.calTable.length, 3);
});

test("a node whose error changes with level gets gain + offset", () => {
  const r = computeCalibration(load("node-compresses.csv"));
  assert.equal(r.model.type, "gain+offset");
  assert.ok(Math.abs(r.model.gain - 1 / 0.85) < 0.02);
  assert.ok(r.maxError < 0.2);
});

test("the wrong correction fails verification", () => {
  const model = computeCalibration(load("node-reads-low.csv")).model;
  const errors = errorsFor(levelAverages(load("node-compresses.csv")), model);
  assert.ok(Math.max(...errors.map(e => Math.abs(e.error))) > 2);
});

test("bad input is explained", () => {
  assert.throws(() => parseCsv("level,reference_dB\n50,50"), /node_dB/);
  assert.throws(() => parseCsv("level,reference_dB,node_dB\n50,loud,49"), /not a number/);
});
