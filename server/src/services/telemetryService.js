import * as tablesModel from "../models/tablesModel.js";
import * as sensorStatusModel from "../models/sensorStatusModel.js";
import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import { env } from "../config/env.js";
import { computeLedCounts } from "../utils/ledLogic.js";
import { decideVerdict, categoryDurationSeconds, LABEL_WAIT_SECONDS } from "../utils/violationRules.js";
import { createIncident } from "./incidentsService.js";
import { serializeTable } from "./tablesService.js";
import { broadcastTableUpdate, broadcastIncidentCreated } from "../realtime/wsServer.js";
import { publishLedState, requestAudioClip } from "../mqtt/mqttClient.js";
import { classifyAudioClip, isMlServiceUp } from "./mlClient.js";
import { isLikelyWav } from "../mqtt/topics.js";

// ---- Timing rules (seconds) -----------------------------------------------
// A loud streak survives a dip below critical of up to this long.
export const DIP_TOLERANCE_SECONDS = 2;
// Devices send one reading per second. A longer silence means we can't
// know the table stayed loud: an undecided streak is discarded.
export const MAX_READING_GAP_SECONDS = 5;
// Ask for a new audio clip at the streak start, then this often.
export const AUDIO_RECLASSIFY_SECONDS = 5;
// LABEL_WAIT_SECONDS (8 s wait for a first label) lives in violationRules.js.
// A clip on /audio is only accepted this long after we asked for one.
export const AUDIO_ACCEPT_WINDOW_SECONDS = 10;

const secondsBetween = (later, earlier) => (new Date(later).getTime() - new Date(earlier).getTime()) / 1000;
const iso = date => new Date(date).toISOString();
const warnedUnknownNodeIds = new Set();

/**
 * Handles one telemetry message: store the reading, run the confirmation
 * engine, send the LED state back to the device, and push the update to
 * open dashboards. `now` is when the message arrived (mqttClient.js), or a
 * simulated time in the tests.
 *
 * mqttClient.js processes messages for the same node one at a time, so two
 * readings can never run the engine at the same moment for one table.
 */
export async function ingestTelemetry(nodeId, { db_level, classification, confidence, timestamp }, { now: clock } = {}) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) {
    if (!warnedUnknownNodeIds.has(nodeId)) {
      warnedUnknownNodeIds.add(nodeId);
      console.warn(`[telemetry] No table registered for sensor_node_id "${nodeId}". Add it under Table Configuration first.`);
    }
    return;
  }

  const now = clock ? new Date(clock) : new Date();
  const previous = await sensorStatusModel.findByTableId(table.id);
  if (!previous) return;

  await noiseReadingsModel.create({ table_id: table.id, db_level, classification, confidence, recorded_at: timestamp || iso(now) });
  await sensorStatusModel.recordTelemetry(table.id, {
    current_db: db_level,
    classification,
    confidence,
    clearClassification: !classification && db_level < Number(table.warning_threshold),
    seenAt: iso(now)
  });

  const ledCritical = await runConfirmationEngine(table, db_level, previous, now);

  publishLedState(nodeId, { ...computeLedCounts(db_level, table), critical: ledCritical });
  broadcastTableUpdate(await serializeTable(table));
}

/**
 * The confirmation engine. A dB-triggered event only becomes a violation
 * if the sound type says so:
 *
 * 1. A streak starts at the first reading >= critical_threshold (unless the
 *    table is in its cooldown). Dips of up to DIP_TOLERANCE_SECONDS don't
 *    end it. Audio is requested at the start and every 5 s.
 * 2. Once it lasted the sustained time (confirmation_seconds, or less for
 *    phone labels) it is decided from the collected labels (decideVerdict).
 *    With no label yet and the ML service up, it waits up to
 *    LABEL_WAIT_SECONDS first.
 * 3. Only a VIOLATION decided while the streak is still going lights the
 *    critical bulb (bulb_triggered). IGNORED / UNVERIFIED never do.
 * 4. A streak that ends early is dropped; one that ends by a reading gap is
 *    discarded, never confirmed late. A decided streak starts a cooldown.
 *
 * State lives in sensor_status, so a restart doesn't lose it. Returns the
 * new led_critical value.
 */
async function runConfirmationEngine(table, dbLevel, previous, now) {
  const loud = dbLevel >= Number(table.critical_threshold);
  let streak = previous;

  // Reading gap: the node was silent too long during a streak.
  if (streak.monitoring_since && (!streak.last_seen || secondsBetween(now, streak.last_seen) > MAX_READING_GAP_SECONDS)) {
    await finishStreak(table, streak, now, { decided: Boolean(streak.active_incident_id) });
    streak = { ...streak, monitoring_since: null, active_incident_id: null, led_critical: false };
  }

  if (streak.monitoring_since) {
    // Over = the quiet spell since the last loud reading is longer than the
    // dip tolerance. For a loud reading the spell ended at the previous
    // reading, so two quiet readings followed by a loud one keep the streak.
    const quietUntil = loud ? streak.last_seen : now;
    const over = secondsBetween(quietUntil, streak.last_loud_at || streak.monitoring_since) > DIP_TOLERANCE_SECONDS;

    if (streak.active_incident_id) {
      // Already decided. Keep the bulb as it is until the streak ends.
      if (!over) {
        if (loud) await sensorStatusModel.continueStreak(table.id, iso(now), dbLevel);
        return Boolean(streak.led_critical);
      }
      await finishStreak(table, streak, now, { decided: true });
      return false;
    }

    if (over) {
      // Ended before it was decided. Long enough? Then it was only waiting
      // for a label: decide now (or keep waiting), without the bulb.
      const labels = streak.streak_labels || [];
      const lasted = secondsBetween(streak.last_loud_at, streak.monitoring_since);
      const required = categoryDurationSeconds(table, labels);
      if (lasted < required) {
        await sensorStatusModel.endStreak(table.id);
        return startStreakIfAllowed(table, streak, dbLevel, now, loud);
      }
      const waitedEnough = secondsBetween(now, streak.monitoring_since) >= required + LABEL_WAIT_SECONDS;
      if (!loud && !labels.length && isMlServiceUp() && !waitedEnough && table.status !== "PAUSED") return false;
      await decide(table, streak, now, { live: false });
      await finishStreak(table, streak, now, { decided: true });
      return false;
    }

    // Live, undecided streak.
    if (loud) {
      streak = await sensorStatusModel.continueStreak(table.id, iso(now), dbLevel);
      await maybeRequestAudio(table, streak, now);
    }
    const labels = streak.streak_labels || [];
    const elapsed = secondsBetween(now, streak.monitoring_since);
    const required = categoryDurationSeconds(table, labels);
    if (elapsed < required) return false;
    if (!labels.length && isMlServiceUp() && elapsed < required + LABEL_WAIT_SECONDS && table.status !== "PAUSED") return false;
    return decide(table, streak, now, { live: true });
  }

  return startStreakIfAllowed(table, streak, dbLevel, now, loud);
}

async function startStreakIfAllowed(table, status, dbLevel, now, loud) {
  if (!loud) return false;
  if (status.cooldown_until && new Date(status.cooldown_until) > now) return false;
  const streak = await sensorStatusModel.startStreak(table.id, iso(now), dbLevel);
  await maybeRequestAudio(table, streak, now, { force: true });
  return false;
}

// Clears the streak; a decided one also starts the cooldown.
async function finishStreak(table, streak, now, { decided }) {
  const cooldownUntil = decided ? iso(new Date(now).getTime() + env.violationCooldownSeconds * 1000) : null;
  await sensorStatusModel.endStreak(table.id, cooldownUntil);
}

// Ask the device for an audio clip (streak start, then every 5 s).
async function maybeRequestAudio(table, streak, now, { force = false } = {}) {
  const last = streak?.last_audio_requested_at;
  if (!force && last && secondsBetween(now, last) < AUDIO_RECLASSIFY_SECONDS) return;
  requestAudioClip(table.sensor_node_id);
  await sensorStatusModel.markAudioRequested(table.id, iso(now));
}

/**
 * Turns the streak into an incident. `live` = the streak is still going,
 * so a VIOLATION lights the critical bulb. Returns the new led_critical.
 */
async function decide(table, streak, now, { live }) {
  let verdict = decideVerdict(streak.streak_labels || []);
  if (table.status === "PAUSED") verdict = { ...verdict, verdict: "IGNORED", status: "IGNORED", filter_reason: "table_paused" };
  // Neighbour crosstalk check ("neighbor_louder") is not done: the tables
  // table has no position/adjacency data. See CHANGES.md.

  const confirmed = verdict.status === "CONFIRMED";
  const ledCritical = live && confirmed;
  const peak = Number(streak.peak_db);
  const end = live ? now : streak.last_loud_at;

  const incident = await createIncident(
    {
      table_id: table.id,
      category: verdict.category,
      db_level: peak,
      peak_db: peak,
      confidence: verdict.confidence,
      top_class: verdict.top_class,
      filter_reason: verdict.filter_reason,
      duration_seconds: Math.max(0, Math.round(secondsBetween(end, streak.monitoring_since))),
      bulb_triggered: ledCritical,
      status: verdict.status,
      occurred_at: iso(streak.monitoring_since)
    },
    { occupantAt: iso(streak.monitoring_since) }
  );

  if (live) await sensorStatusModel.markStreakDecided(table.id, incident.id, ledCritical);
  broadcastIncidentCreated(incident);
  return ledCritical;
}

/**
 * A device sent a WAV clip (after an audio-request). Forward it to the ML
 * service and store only the label; the audio itself is never saved.
 * During a streak the label is appended to streak_labels atomically.
 */
export async function ingestAudioClip(nodeId, wavBuffer, { now: clock } = {}) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) return;

  if (!isLikelyWav(wavBuffer)) {
    console.warn(`[telemetry] Ignoring non-WAV audio payload from ${nodeId}.`);
    return;
  }

  // Only clips we asked for recently are classified. Anything else (a
  // replayed or forged message on the audio topic) is dropped unread.
  const now = clock ? new Date(clock) : new Date();
  const status = await sensorStatusModel.findByTableId(table.id);
  const asked = status?.last_audio_requested_at;
  if (!asked || secondsBetween(now, asked) > AUDIO_ACCEPT_WINDOW_SECONDS) {
    console.warn(`[telemetry] Ignoring unrequested audio clip from ${nodeId}.`);
    return;
  }

  const result = await classifyAudioClip(wavBuffer);
  if (!result) return; // ML service asleep or down: everything else keeps working

  await sensorStatusModel.appendStreakLabel(table.id, { ...result, at: iso(now) });
  broadcastTableUpdate(await serializeTable(table));
}

/**
 * Online/offline status message (also sent by the broker as the device's
 * Last Will). A retained "online" sets the flag but not last_seen: it may be
 * an old message, so the node only counts as online once it really reports.
 */
export async function ingestStatus(nodeId, { online }, { retained = false } = {}) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) return;

  if (online) await sensorStatusModel.setOnline(table.id, true, { touchLastSeen: !retained });
  else await sensorStatusModel.setOffline(table.id);

  broadcastTableUpdate(await serializeTable(table));
}

/**
 * Heartbeat sweep (run every 15 s from server.js). A node that loses power
 * may never send "offline" (e.g. the API was down when its Last Will fired),
 * so any sensor silent for longer than SENSOR_STALE_SECONDS is marked
 * offline here, and open dashboards get a table:update right away.
 * Returns the table ids that changed.
 */
export async function sweepStaleSensors(staleSeconds) {
  const tableIds = await sensorStatusModel.markStaleOffline(staleSeconds);
  for (const tableId of tableIds) {
    const table = await tablesModel.findById(tableId);
    if (table) broadcastTableUpdate(await serializeTable(table));
  }
  return tableIds;
}
