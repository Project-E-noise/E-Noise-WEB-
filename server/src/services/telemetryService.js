import * as tablesModel from "../models/tablesModel.js";
import * as sensorStatusModel from "../models/sensorStatusModel.js";
import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import { computeLedCounts } from "../utils/ledLogic.js";
import { createIncident } from "./incidentsService.js";
import { serializeTable } from "./tablesService.js";
import { broadcastTableUpdate, broadcastIncidentCreated } from "../realtime/wsServer.js";
import { publishLedState, requestAudioClip } from "../mqtt/mqttClient.js";
import { classifyAudioClip } from "./mlClient.js";
import { isLikelyWav } from "../mqtt/topics.js";

// Ask a loud table for a new audio clip at most once every 5 seconds
// (audio is only captured while the table is above its warning threshold).
const AUDIO_RECLASSIFY_SECONDS = 5;

// Devices send one reading per second. If the gap since the previous
// reading is longer than this, a running "loud" streak starts over,
// because we can't know it stayed loud during the gap.
const MAX_READING_GAP_SECONDS = 5;

// Used when the ML service gave no label during the whole streak. The
// database requires one of the four categories, so this is a fallback,
// not a classifier result.
const FALLBACK_CATEGORY = "Loud Conversation";

const secondsBetween = (later, earlier) => (new Date(later).getTime() - new Date(earlier).getTime()) / 1000;

/**
 * Handles one telemetry message: store the reading, run the critical
 * confirmation rule, send the LED state back to the device, and push the
 * update to open dashboards.
 *
 * mqttClient.js processes messages for the same node one at a time, so two
 * readings can never run the confirmation rule at the same moment.
 */
export async function ingestTelemetry(nodeId, { db_level, classification, confidence, timestamp }) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) {
    console.warn(`[telemetry] No table registered for sensor_node_id "${nodeId}". Add it under Table Configuration first.`);
    return;
  }

  const now = new Date().toISOString();
  const previous = await sensorStatusModel.findByTableId(table.id);
  if (!previous) return;

  await noiseReadingsModel.create({ table_id: table.id, db_level, classification, confidence, recorded_at: timestamp || now });
  await sensorStatusModel.recordTelemetry(table.id, {
    current_db: db_level,
    classification,
    confidence,
    clearClassification: !classification && db_level < Number(table.warning_threshold),
    seenAt: now
  });

  await maybeRequestAudio(table, db_level, previous);
  const ledCritical = await runConfirmationEngine(table, db_level, previous, now);

  publishLedState(nodeId, { ...computeLedCounts(db_level, table), critical: ledCritical });
  broadcastTableUpdate(await serializeTable(table));
}

// Ask the device for an audio clip when the table is loud (throttled).
async function maybeRequestAudio(table, dbLevel, sensorStatus) {
  if (dbLevel < Number(table.warning_threshold)) return;
  const last = sensorStatus.last_audio_requested_at;
  if (last && secondsBetween(new Date(), last) < AUDIO_RECLASSIFY_SECONDS) return;
  requestAudioClip(table.sensor_node_id);
  await sensorStatusModel.markAudioRequested(table.id);
}

/**
 * The critical confirmation rule. The critical bulb and a CONFIRMED
 * incident only happen after the level stays at/above critical_threshold
 * for confirmation_seconds in a row. Returns the new led_critical value.
 * State is stored in sensor_status, so it survives a server restart.
 */
async function runConfirmationEngine(table, dbLevel, status, now) {
  const aboveCritical = dbLevel >= Number(table.critical_threshold);

  if (!aboveCritical) {
    // Quiet again: switch the bulb off, or drop an unconfirmed streak.
    // A confirmed incident stays in the log; it really happened.
    if (status.led_critical) await sensorStatusModel.clearCritical(table.id);
    else if (status.monitoring_since) await sensorStatusModel.clearMonitoring(table.id);
    return false;
  }

  if (status.led_critical) return true; // already confirmed, same streak

  if (!status.monitoring_since) {
    await sensorStatusModel.startMonitoring(table.id, now);
    return false;
  }

  // Readings stopped for a while: start counting again from now.
  if (!status.last_seen || secondsBetween(now, status.last_seen) > MAX_READING_GAP_SECONDS) {
    await sensorStatusModel.restartMonitoring(table.id, now);
    return false;
  }

  const elapsedSeconds = secondsBetween(now, status.monitoring_since);
  if (elapsedSeconds < Number(table.confirmation_seconds)) return false;

  // Sustained long enough: confirm. The classification normally comes from
  // the ML service (audio is requested as soon as the table passes warning).
  const latest = await sensorStatusModel.findByTableId(table.id);
  const incident = await createIncident({
    table_id: table.id,
    category: latest?.classification || FALLBACK_CATEGORY,
    db_level: dbLevel,
    confidence: latest?.classification && latest.confidence != null ? Number(latest.confidence) : null,
    duration_seconds: Math.round(elapsedSeconds),
    bulb_triggered: true,
    status: "CONFIRMED",
    occurred_at: new Date(status.monitoring_since).toISOString()
  });

  await sensorStatusModel.confirmCritical(table.id, incident.id);
  broadcastIncidentCreated(incident);
  return true;
}

/**
 * A device sent a WAV clip (after an audio-request). Forward it to the ML
 * service and store only the label and confidence; the audio itself is
 * never saved anywhere.
 */
export async function ingestAudioClip(nodeId, wavBuffer) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) return;

  if (!isLikelyWav(wavBuffer)) {
    console.warn(`[telemetry] Ignoring non-WAV audio payload from ${nodeId}.`);
    return;
  }

  const result = await classifyAudioClip(wavBuffer);
  if (!result) return; // ML service asleep or down: everything else keeps working

  await sensorStatusModel.recordClassification(table.id, { classification: result.category, confidence: result.confidence });
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
