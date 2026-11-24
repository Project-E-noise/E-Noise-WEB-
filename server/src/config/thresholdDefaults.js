// Default thresholds for NEW tables. Existing tables keep their own values,
// which admins change on the Thresholds page.
//
// PROVISIONAL until the nodes are calibrated (docs/CALIBRATION.md). On the
// uncalibrated nodes, Studify's quiet room read about 60 dB (mostly highway
// traffic) and someone talking about 80-90 dB. With 68 / 75 a quiet table
// stays green and sustained talking crosses the "loud" threshold. After
// calibration, set DEFAULT_WARNING_THRESHOLD / DEFAULT_CRITICAL_THRESHOLD in
// the environment; no code change is needed.
//
// No imports here, so the db scripts (seed-tables.js) can use it without
// loading the whole API configuration.
export const FALLBACK_WARNING_THRESHOLD = 68;
export const FALLBACK_CRITICAL_THRESHOLD = 75;

/**
 * Reads DEFAULT_WARNING_THRESHOLD / DEFAULT_CRITICAL_THRESHOLD.
 * Returns { warning, critical } or throws an Error with a readable message.
 */
export function readThresholdDefaults(source = process.env) {
  const read = (name, fallback) => {
    const raw = source[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 150) throw new Error(`${name} must be a number between 0 and 150 (dB).`);
    return value;
  };
  const warning = read("DEFAULT_WARNING_THRESHOLD", FALLBACK_WARNING_THRESHOLD);
  const critical = read("DEFAULT_CRITICAL_THRESHOLD", FALLBACK_CRITICAL_THRESHOLD);
  if (warning >= critical) throw new Error("DEFAULT_WARNING_THRESHOLD must be lower than DEFAULT_CRITICAL_THRESHOLD.");
  return { warning, critical };
}
