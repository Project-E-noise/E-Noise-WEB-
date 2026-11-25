// Pure rules that decide whether a loud streak was a violation, from the
// ML labels collected while it lasted. No database access here, so the
// rules are easy to test and to explain.
//
// The dB level only says "something was loud". The label decides whether
// that loud thing counts: only VIOLATION_CATEGORIES become CONFIRMED
// incidents (strike, critical bulb). Everything else is logged for review.
import { env } from "../config/env.js";
import { ML_CATEGORIES, VIOLATION_CATEGORIES } from "../data/constants.js";

export { VIOLATION_CATEGORIES };

// PLACEHOLDER: tune with labelled recordings from the study hub.
export const MIN_CONFIDENCE = env.minConfidence;

// After the sustained time, the engine waits this long (seconds) for a
// first label, but only while the ML service answers.
export const LABEL_WAIT_SECONDS = 8;

// Sustained time per category, in seconds, when shorter than the table's
// confirmation_seconds. Phone rings are short bursts. PLACEHOLDER value.
export const CATEGORY_CONFIRMATION_SECONDS = { "Mobile Phone Noise": env.phoneConfirmationSeconds };

const result = (verdict, status, filter_reason, best) => ({
  verdict,
  status,
  filter_reason,
  category: best?.category ?? null,
  confidence: best?.confidence ?? null,
  top_class: best?.top_class ?? null
});

const isKnown = label => label && ML_CATEGORIES.includes(label.category) && Number.isFinite(Number(label.confidence));
const byConfidence = (a, b) => Number(b.confidence) - Number(a.confidence);

/**
 * Picks the most common category among `labels`, ties broken by the highest
 * single confidence. Returns that category's most confident label.
 */
function representative(labels) {
  const groups = new Map();
  for (const label of labels) {
    if (!groups.has(label.category)) groups.set(label.category, []);
    groups.get(label.category).push(label);
  }
  let best = null;
  for (const group of groups.values()) {
    group.sort(byConfidence);
    if (!best || group.length > best.length || (group.length === best.length && byConfidence(group[0], best[0]) < 0)) best = group;
  }
  return best ? best[0] : null;
}

/**
 * labels: [{ category, confidence, top_class }] collected during one streak.
 * Returns { verdict, status, filter_reason, category, confidence, top_class }:
 *   no labels                                  -> UNVERIFIED (no_classification)
 *   no label with confidence >= minConfidence  -> UNVERIFIED (low_confidence)
 *   strict majority of confident labels in a violation category -> VIOLATION (status CONFIRMED)
 *   otherwise (including a tie)                -> IGNORED (non_violation_category)
 */
export function decideVerdict(labels, { minConfidence = MIN_CONFIDENCE, violationCategories = VIOLATION_CATEGORIES } = {}) {
  const known = (Array.isArray(labels) ? labels : []).filter(isKnown).map(l => ({ ...l, confidence: Number(l.confidence), top_class: l.top_class ?? null }));
  if (!known.length) return result("UNVERIFIED", "UNVERIFIED", "no_classification", null);

  const confident = known.filter(l => l.confidence >= minConfidence);
  if (!confident.length) {
    // Keep the best guess for review, but an unverified event has no category.
    const best = [...known].sort(byConfidence)[0];
    return result("UNVERIFIED", "UNVERIFIED", "low_confidence", { ...best, category: null });
  }

  const violating = confident.filter(l => violationCategories.includes(l.category));
  if (violating.length * 2 > confident.length) return result("VIOLATION", "CONFIRMED", null, representative(violating));

  const other = confident.filter(l => !violationCategories.includes(l.category));
  return result("IGNORED", "IGNORED", "non_violation_category", representative(other.length ? other : confident));
}

/**
 * How long a streak must last before it is decided: the table's
 * confirmation_seconds, or a shorter per-category time when a confident
 * label of that category has already arrived (e.g. a phone ring).
 */
export function categoryDurationSeconds(table, labels, overrides = CATEGORY_CONFIRMATION_SECONDS, { minConfidence = MIN_CONFIDENCE } = {}) {
  const base = Number(table.confirmation_seconds);
  let seconds = base;
  for (const label of Array.isArray(labels) ? labels : []) {
    if (!isKnown(label) || Number(label.confidence) < minConfidence) continue;
    const override = overrides[label.category];
    if (override != null) seconds = Math.min(seconds, override);
  }
  return Math.min(seconds, base);
}
