// Single source of truth for turning a dB reading + table thresholds into
// the non-critical LED counts and the SAFE/WARNING/CRITICAL status label.
// Shared by tablesService.js (REST reads) and telemetryService.js (MQTT
// ingestion), so the two never drift apart.
//
// The critical bulb is deliberately NOT decided here — per the spec's
// "critical LED rule" it may only turn on once a threshold crossing has
// been sustained for confirmation_seconds, which is a stateful, time-based
// decision that belongs to telemetryService's confirmation engine, not to
// a stateless per-reading calculation.

export function computeLedCounts(dbLevel, table) {
  if (dbLevel == null) return { green: 0, yellow: 0, red: 0 };

  const warning = Number(table.warning_threshold);
  const critical = Number(table.critical_threshold);

  if (dbLevel < warning) {
    const green = Math.min(5, Math.max(1, Math.round((dbLevel / warning) * 5)));
    return { green, yellow: 0, red: 0 };
  }
  if (dbLevel < critical) {
    const span = critical - warning || 1;
    const yellow = Math.min(2, Math.max(1, Math.round(((dbLevel - warning) / span) * 2)));
    return { green: 5, yellow, red: 0 };
  }
  return { green: 5, yellow: 2, red: 2 };
}

export function computeStatus(dbLevel, table) {
  if (dbLevel == null) return "SAFE";
  if (dbLevel >= Number(table.critical_threshold)) return "CRITICAL";
  if (dbLevel >= Number(table.warning_threshold)) return "WARNING";
  return "SAFE";
}
