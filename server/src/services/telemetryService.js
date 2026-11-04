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

// How often (at most) to ask a node for a fresh audio clip while it stays
// above warning_threshold. Keeps a sustained loud streak from triggering a
// capture request on every single telemetry message (once/second) — one
// clip every few seconds is plenty to keep the classification current, and
// matches the spec's "no continuous audio" privacy posture (Phase 7 only
// captures audio when the table is already noteworthy, never at baseline).
const AUDIO_RECLASSIFY_SECONDS = 5;

// Phase 5: turns one MQTT telemetry message into stored readings, the
// 10-second critical-confirmation decision, an LED command back to the
// device, and a WebSocket push to every connected dashboard.
//
// The confirmation state machine itself lives entirely in the sensor_status
// row (monitoring_since / led_critical / active_incident_id — see migration
// 009), not in a separate in-memory map, so it survives a server restart
// mid-streak and works correctly even if a second backend instance were
// ever run (only one writes at a time per table since MQTT is 1 message
// at a time here, so no extra locking is needed for this project's scale).
export async function ingestTelemetry(nodeId, { db_level, classification, confidence, timestamp }) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) {
    // eslint-disable-next-line no-console
    console.warn(`[telemetry] No table registered for sensor_node_id "${nodeId}" — add it under Table Configuration first.`);
    return;
  }

  await noiseReadingsModel.create({
    table_id: table.id,
    db_level,
    classification,
    confidence,
    recorded_at: timestamp || new Date().toISOString()
  });

  await sensorStatusModel.recordTelemetry(table.id, { current_db: db_level, classification, confidence });

  await maybeRequestAudio(table, db_level);
  await runConfirmationEngine(table, db_level);

  const ledCounts = computeLedCounts(db_level, table);
  const sensorStatus = await sensorStatusModel.findByTableId(table.id);
  publishLedState(nodeId, { ...ledCounts, critical: sensorStatus?.led_critical ?? false });

  const updated = await serializeTable(table);
  broadcastTableUpdate(updated);
}

// Phase 7: request a fresh audio clip for classification once a table
// crosses warning_threshold, throttled to at most one request per
// AUDIO_RECLASSIFY_SECONDS. A quiet table is never asked for audio at all.
async function maybeRequestAudio(table, dbLevel) {
  if (dbLevel == null || dbLevel < Number(table.warning_threshold)) return;

  const sensorStatus = await sensorStatusModel.findByTableId(table.id);
  if (!sensorStatus) return;

  const last = sensorStatus.last_audio_requested_at;
  const elapsedSeconds = last ? (Date.now() - new Date(last).getTime()) / 1000 : Infinity;
  if (elapsedSeconds < AUDIO_RECLASSIFY_SECONDS) return;

  requestAudioClip(table.sensor_node_id);
  await sensorStatusModel.markAudioRequested(table.id);
}

/**
 * A device responded to an audio-request with a WAV clip. Forwards it to
 * the ML service, stores only the resulting label/confidence (never the
 * audio itself — see topics.js's isLikelyWav doc comment on the "no raw
 * audio storage" rule), and broadcasts the update. If classification lands
 * while a critical streak is still being confirmed, the next confirmation
 * check picks up the fresh sensorStatus.classification automatically —
 * no separate wiring needed there.
 */
export async function ingestAudioClip(nodeId, wavBuffer) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) return;

  if (!isLikelyWav(wavBuffer)) {
    console.warn(`[telemetry] Ignoring non-WAV audio payload from ${nodeId}.`);
    return;
  }

  const result = await classifyAudioClip(wavBuffer);
  if (!result) return; // ML service unreachable/errored — telemetry keeps working without it

  await sensorStatusModel.recordClassification(table.id, {
    classification: result.category,
    confidence: result.confidence
  });

  const updated = await serializeTable(table);
  broadcastTableUpdate(updated);
}

async function runConfirmationEngine(table, dbLevel) {
  const critical = Number(table.critical_threshold);
  const sensorStatus = await sensorStatusModel.findByTableId(table.id);
  if (!sensorStatus) return;

  const aboveCritical = dbLevel != null && dbLevel >= critical;

  if (!aboveCritical) {
    if (sensorStatus.led_critical) {
      // The confirmed condition has cleared — turn the bulb off. The
      // incident record itself stays (it really happened); we just stop
      // treating it as "currently ongoing".
      await sensorStatusModel.clearCritical(table.id);
    } else if (sensorStatus.monitoring_since) {
      // Never reached confirmation_seconds — dismiss silently, no incident.
      await sensorStatusModel.clearMonitoring(table.id);
    }
    return;
  }

  if (sensorStatus.led_critical) return; // already confirmed and ongoing — nothing new to do

  if (!sensorStatus.monitoring_since) {
    await sensorStatusModel.startMonitoring(table.id);
    return;
  }

  const elapsedSeconds = (Date.now() - new Date(sensorStatus.monitoring_since).getTime()) / 1000;
  if (elapsedSeconds < Number(table.confirmation_seconds)) return; // still within the confirmation window

  // sensorStatus.classification is populated by ingestAudioClip() once the
  // ML service (Phase 7, ml-service/) returns a result for a requested
  // clip — maybeRequestAudio() above ensures one was asked for as soon as
  // this table crossed warning_threshold, so by the time a streak reaches
  // confirmation_seconds there's normally already a real classification.
  // The "Loud Conversation" fallback only fires if the ML service was
  // unreachable/slow for this entire streak (the schema requires one of
  // the four exact categories; leaving it null isn't an option).
  const incident = await createIncident({
    table_id: table.id,
    category: sensorStatus.classification || "Loud Conversation",
    db_level: dbLevel,
    confidence: sensorStatus.confidence,
    duration_seconds: Math.round(elapsedSeconds),
    bulb_triggered: true,
    status: "CONFIRMED",
    occurred_at: sensorStatus.monitoring_since
  });

  await sensorStatusModel.confirmCritical(table.id, incident.id);
  broadcastIncidentCreated(incident);
}

/** Explicit online/offline status message (also fires as MQTT's Last Will on an ungraceful disconnect). */
export async function ingestStatus(nodeId, { online }) {
  const table = await tablesModel.findBySensorNodeId(nodeId);
  if (!table) return;

  if (online) await sensorStatusModel.setOnline(table.id, true);
  else await sensorStatusModel.setOffline(table.id);

  const updated = await serializeTable(table);
  broadcastTableUpdate(updated);
}
