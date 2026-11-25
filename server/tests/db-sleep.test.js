// P1 (docs/DB_LOAD_PROPOSAL.md): the 15 s offline sweep is skipped once it
// can't change anything, so the database can sleep while every node is off.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";
import { sweepNeeded, noteSweepDone, noteNodeMessage } from "../src/services/telemetryService.js";

test("the sweep runs at start, while nodes talk, and once more after they stop; then it is skipped", () => {
  const stale = 15;
  const t = s => 1_000_000_000_000 + s * 1000;
  assert.equal(sweepNeeded(stale), true, "first sweep after start-up always runs");

  noteNodeMessage(t(0));
  noteSweepDone(t(5));
  assert.equal(sweepNeeded(stale), true, "a node talked 5 s ago: it may still need marking offline later");

  noteSweepDone(t(15)); // last message was exactly 15 s before
  assert.equal(sweepNeeded(stale), true);

  noteSweepDone(t(16)); // more than 15 s after the last message: everything was marked offline
  assert.equal(sweepNeeded(stale), false, "nothing new since: skip, no query");

  noteNodeMessage(t(100)); // a node comes back
  assert.equal(sweepNeeded(stale), true);
});
