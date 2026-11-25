import { env } from "../config/env.js";

// Single source of truth for turning a dB reading + table thresholds into
// the non-critical LED counts and the SAFE/WARNING/CRITICAL status label.
// Shared by tablesService.js (REST reads) and telemetryService.js (MQTT
// ingestion), so the two never drift apart.
//
// The critical bulb is deliberately NOT decided here: it only turns on for a
// confirmed violation (loud for confirmation_seconds AND a violation sound),
// which is a stateful decision made by telemetryService's confirmation
// engine, not by a per-reading calculation.

// LED bands (provisional until calibration, docs/CALIBRATION.md), e.g. with
// warning 68 / critical 75 and the defaults below:
//   green 1-5  in 5 equal steps from the quiet floor (50 dB) to warning:
//              50 -> 1, 53.6 -> 2, 57.2 -> 3, 60.8 -> 4, 64.4 -> 5
//              (at least 1, so a working node never looks switched off)
//   yellow 1-3 in thirds between warning and critical (68 / 70.3 / 72.7)
//   red 1      at critical (75), red 2 from critical + 5 dB (80)
// The floor is at most 10 dB under the warning threshold, so a table with
// a low warning threshold still gets a 10 dB green range.
export function computeLedCounts(dbLevel, table, { greenFloor = env.ledGreenFloorDb, redStep = env.ledRedStepDb } = {}) {
  if (dbLevel == null) return { green: 0, yellow: 0, red: 0 };

  const warning = Number(table.warning_threshold);
  const critical = Number(table.critical_threshold);

  if (dbLevel < warning) {
    const floor = Math.min(greenFloor, warning - 10);
    // + 1e-9: a reading exactly on a band edge (e.g. 60.8) must not fall one
    // step short because of floating-point rounding.
    const green = Math.min(5, Math.max(1, 1 + Math.floor(((dbLevel - floor) / (warning - floor)) * 5 + 1e-9)));
    return { green, yellow: 0, red: 0 };
  }
  if (dbLevel < critical) {
    const span = critical - warning || 1;
    // Yellow fills at warning, then at each one-third boundary; values exactly on a boundary enter the next step.
    const yellow = Math.min(3, Math.max(1, Math.floor(((dbLevel - warning) / span) * 3) + 1));
    return { green: 5, yellow, red: 0 };
  }
  return { green: 5, yellow: 3, red: dbLevel >= critical + redStep ? 2 : 1 };
}

export function computeStatus(dbLevel, table) {
  if (dbLevel == null) return "SAFE";
  if (dbLevel >= Number(table.critical_threshold)) return "CRITICAL";
  if (dbLevel >= Number(table.warning_threshold)) return "WARNING";
  return "SAFE";
}
