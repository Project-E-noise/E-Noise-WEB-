// decideVerdict: pure rules that turn the labels collected during a loud
// streak into VIOLATION / IGNORED / UNVERIFIED. No database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideVerdict, MIN_CONFIDENCE, VIOLATION_CATEGORIES, categoryDurationSeconds } from "../src/utils/violationRules.js";
import { ML_CATEGORIES } from "../src/data/constants.js";

const label = (category, confidence = 0.9, top_class = null) => ({ category, confidence, top_class });

test("the violation list is a subset of the categories and excludes impact and ambient", () => {
  for (const c of VIOLATION_CATEGORIES) assert.ok(ML_CATEGORIES.includes(c), c);
  assert.ok(!VIOLATION_CATEGORIES.includes("Impact Noise"));
  assert.ok(!VIOLATION_CATEGORIES.includes("Ambient Baseline"));
  assert.equal(MIN_CONFIDENCE, 0.5, "default placeholder threshold");
});

test("no labels -> UNVERIFIED (no_classification)", () => {
  assert.deepEqual(decideVerdict([]), { verdict: "UNVERIFIED", status: "UNVERIFIED", filter_reason: "no_classification", category: null, confidence: null, top_class: null });
  assert.equal(decideVerdict(null).filter_reason, "no_classification");
});

test("no confident label -> UNVERIFIED (low_confidence)", () => {
  const result = decideVerdict([label("Loud Conversation", 0.3, "Speech"), label("Music", 0.49, "Guitar")]);
  assert.equal(result.verdict, "UNVERIFIED");
  assert.equal(result.filter_reason, "low_confidence");
  assert.equal(result.category, null, "an unverified event has no category");
  assert.equal(result.top_class, "Guitar", "the most confident label is still reported for review");
  assert.equal(result.confidence, 0.49);
});

test("a confidence exactly at the threshold counts", () => {
  assert.equal(decideVerdict([label("Loud Conversation", 0.5)]).verdict, "VIOLATION");
});

test("strict majority of confident labels in violation categories -> VIOLATION", () => {
  const result = decideVerdict([label("Loud Conversation", 0.8, "Speech"), label("Impact Noise", 0.9, "Door"), label("Music", 0.7, "Guitar")]);
  assert.equal(result.verdict, "VIOLATION");
  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.filter_reason, null);
  assert.ok(VIOLATION_CATEGORIES.includes(result.category));
});

test("the category of a violation is the most frequent violation category, ties broken by confidence", () => {
  const result = decideVerdict([label("Music", 0.6, "Guitar"), label("Loud Conversation", 0.9, "Shout"), label("Loud Conversation", 0.7, "Speech"), label("Ambient Baseline", 0.9)]);
  assert.equal(result.category, "Loud Conversation");
  assert.equal(result.confidence, 0.9);
  assert.equal(result.top_class, "Shout");
  const tie = decideVerdict([label("Music", 0.95, "Piano"), label("Mobile Phone Noise", 0.6, "Ringtone"), label("Loud Conversation", 0.9)]);
  assert.equal(tie.category, "Music");
});

test("a tie is not a violation -> IGNORED (non_violation_category)", () => {
  const result = decideVerdict([label("Loud Conversation", 0.9, "Speech"), label("Impact Noise", 0.9, "Slam")]);
  assert.equal(result.verdict, "IGNORED");
  assert.equal(result.status, "IGNORED");
  assert.equal(result.filter_reason, "non_violation_category");
});

test("majority in non-violation categories -> IGNORED with the majority category kept for review", () => {
  const result = decideVerdict([label("Impact Noise", 0.9, "Door"), label("Ambient Baseline", 0.8, "Typing"), label("Impact Noise", 0.7, "Slam"), label("Loud Conversation", 0.95, "Speech")]);
  assert.equal(result.verdict, "IGNORED");
  assert.equal(result.category, "Impact Noise");
  assert.equal(result.top_class, "Door");
  assert.equal(result.confidence, 0.9);
});

test("low-confidence labels do not vote", () => {
  // Two confident impact labels vs. one confident conversation label plus
  // three low-confidence conversation labels: impact wins.
  const result = decideVerdict([
    label("Impact Noise", 0.8, "Door"), label("Impact Noise", 0.8, "Slam"),
    label("Loud Conversation", 0.9), label("Loud Conversation", 0.2), label("Loud Conversation", 0.2), label("Loud Conversation", 0.2)
  ]);
  assert.equal(result.verdict, "IGNORED");
});

test("unknown categories are ignored, and a custom threshold or violation list can be passed", () => {
  const labels = [label("Shouting", 0.9), label("Loud Conversation", 0.6)];
  assert.equal(decideVerdict(labels).verdict, "VIOLATION");
  assert.equal(decideVerdict(labels, { minConfidence: 0.7 }).filter_reason, "low_confidence");
  assert.equal(decideVerdict(labels, { violationCategories: ["Music"] }).verdict, "IGNORED");
});

test("sustained time can be shorter for some categories (phone rings) and is read from config", () => {
  const table = { confirmation_seconds: 10 };
  assert.equal(categoryDurationSeconds(table, []), 10, "no labels: the table's own setting");
  assert.equal(categoryDurationSeconds(table, [label("Mobile Phone Noise", 0.9)]), 4, "phone default is 4 s");
  assert.equal(categoryDurationSeconds(table, [label("Mobile Phone Noise", 0.3)]), 10, "a low-confidence phone label does not shorten it");
  assert.equal(categoryDurationSeconds({ confirmation_seconds: 2 }, [label("Mobile Phone Noise", 0.9)]), 2, "never longer than the table's setting");
  assert.equal(categoryDurationSeconds(table, [label("Mobile Phone Noise", 0.9)], { "Mobile Phone Noise": 6 }), 6);
});
