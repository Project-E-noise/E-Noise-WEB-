import * as noiseReadingsModel from "../models/noiseReadingsModel.js";

// Stores one noise_readings row per table per 10-second window instead of
// one per reading (docs/DB_LOAD_PROPOSAL.md, P2): db_level = the window's
// average, peak_db = its loudest reading, samples = how many readings.
// That is ~10x fewer rows to write and store.
//
// Only STORAGE is grouped. Every reading still goes through the violation
// engine, the LEDs and the live dashboard one by one, in real time
// (telemetryService.js).
//
// Windows are kept in memory until they are over; server.js writes finished
// windows every 10 s and all open ones on shutdown. If the API crashes, at
// most the last 10 s of averages are lost (the live state is unaffected).

export const WINDOW_SECONDS = 10;
const WINDOW_MS = WINDOW_SECONDS * 1000;

const open = new Map(); // table id -> { start, sum, count, peak, classification, confidence }

const windowStart = at => new Date(Math.floor(new Date(at).getTime() / WINDOW_MS) * WINDOW_MS);

async function write(tableId, w) {
  try {
    await noiseReadingsModel.createWindow({
      table_id: tableId,
      db_level: Math.round((w.sum / w.count) * 100) / 100,
      peak_db: w.peak,
      samples: w.count,
      classification: w.classification,
      confidence: w.confidence,
      recorded_at: w.start.toISOString()
    });
  } catch (err) {
    console.warn(`[readings] Could not store a 10 s window for table ${tableId}: ${err.message}`);
  }
}

/** Adds one (calibrated) reading to its table's current window. */
export async function addReading(tableId, { db_level, classification, confidence, at }) {
  const start = windowStart(at);
  let w = open.get(tableId);
  if (w && w.start.getTime() !== start.getTime()) {
    // A new window began: store the previous one first.
    open.delete(tableId);
    await write(tableId, w);
    w = null;
  }
  if (!w) {
    w = { start, sum: 0, count: 0, peak: db_level, classification: null, confidence: null };
    open.set(tableId, w);
  }
  w.sum += db_level;
  w.count += 1;
  w.peak = Math.max(w.peak, db_level);
  if (classification) {
    w.classification = classification;
    w.confidence = confidence ?? null;
  }
}

/**
 * Writes the windows that are over (`all`: every open window, used on
 * shutdown and by tests). Returns how many rows were written.
 */
export async function flushReadings({ now = new Date(), all = false } = {}) {
  let written = 0;
  for (const [tableId, w] of [...open]) {
    if (!all && w.start.getTime() + WINDOW_MS > new Date(now).getTime()) continue;
    open.delete(tableId);
    await write(tableId, w);
    written += 1;
  }
  return written;
}
