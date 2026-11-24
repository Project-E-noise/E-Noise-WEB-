// Single source of truth for turning a dB reading + table thresholds into
// the non-critical LED counts and the SAFE/WARNING/CRITICAL status label.
// Shared by tablesService.js (REST reads) and telemetryService.js (MQTT
// ingestion), so the two never drift apart.
//
// The critical bulb is deliberately NOT decided here: it only turns on for a
// confirmed violation (loud for confirmation_seconds AND a violation sound),
// which is a stateful decision made by telemetryService's confirmation
// engine, not by a per-reading calculation.

export function computeLedCounts(dbLevel, table) {
  if (dbLevel == null) return { green: 0, yellow: 0, red: 0 };

  const warning = Number(table.warning_threshold);
  const critical = Number(table.critical_threshold);

  if (dbLevel < warning) {
    // Green shows how close the table is to the warning threshold, in fifths
    // of it (at least 1 LED, so a working node never looks switched off).
    const green = Math.min(5, Math.max(1, Math.round((dbLevel / warning) * 5)));
    return { green, yellow: 0, red: 0 };
  }
  if (dbLevel < critical) {
    const span = critical - warning || 1;
    // Yellow fills at warning, then at each one-third boundary; values exactly on a boundary enter the next step.
    const yellow = Math.min(3, Math.max(1, Math.floor(((dbLevel - warning) / span) * 3) + 1));
    return { green: 5, yellow, red: 0 };
  }
  return { green: 5, yellow: 3, red: 2 };
}

export function computeStatus(dbLevel, table) {
  if (dbLevel == null) return "SAFE";
  if (dbLevel >= Number(table.critical_threshold)) return "CRITICAL";
  if (dbLevel >= Number(table.warning_threshold)) return "WARNING";
  return "SAFE";
}
