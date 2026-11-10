import { query } from "../config/db.js";
import { env } from "../config/env.js";

// The one place that decides whether a sensor is online: the device said so
// (is_online) AND it reported within the last `staleSeconds`. Without the
// time check, a node that died while the API was down stayed "online"
// forever. `param` is the SQL placeholder holding staleSeconds.
export const EFFECTIVE_ONLINE = param =>
  `(is_online AND last_seen IS NOT NULL AND last_seen > NOW() - make_interval(secs => ${param}))`;

// Every row comes with `effective_online` (see above). The stored is_online
// column is kept as-is for the MQTT logic.
export async function findByTableId(tableId, staleSeconds = env.sensorStaleSeconds) {
  const { rows } = await query(
    `SELECT *, ${EFFECTIVE_ONLINE("$2")} AS effective_online FROM sensor_status WHERE table_id = $1`,
    [tableId, staleSeconds]
  );
  return rows[0] || null;
}

// Heartbeat sweep: marks silent sensors offline and returns their table ids
// so open dashboards can be told. Rows already offline are skipped.
export async function markStaleOffline(staleSeconds = env.sensorStaleSeconds) {
  const { rows } = await query(
    `UPDATE sensor_status SET is_online = FALSE, updated_at = NOW()
     WHERE is_online AND (last_seen IS NULL OR last_seen < NOW() - make_interval(secs => $1))
     RETURNING table_id`,
    [staleSeconds]
  );
  return rows.map(row => row.table_id);
}

export async function findAll() {
  const { rows } = await query("SELECT * FROM sensor_status");
  return rows;
}

export async function createForTable(tableId) {
  const { rows } = await query(
    `INSERT INTO sensor_status (table_id, is_online, last_seen) VALUES ($1, FALSE, NULL) RETURNING *`,
    [tableId]
  );
  return rows[0];
}

export async function setOnline(tableId, isOnline) {
  const { rows } = await query(
    `UPDATE sensor_status SET is_online = $2, last_seen = NOW(), updated_at = NOW() WHERE table_id = $1 RETURNING *`,
    [tableId, isOnline]
  );
  return rows[0] || null;
}

// Called on every MQTT telemetry message: marks the node online and stores
// the latest reading. `seenAt` is the app's clock (the confirmation timer
// uses the same clock, so a server/database clock difference can't matter).
//
// Classification: the firmware doesn't send one, so a missing value keeps
// the last ML result instead of wiping it. When the table is quiet again
// (clearClassification), the old label is cleared.
export async function recordTelemetry(tableId, { current_db, classification, confidence, clearClassification, seenAt }) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET is_online = TRUE, last_seen = $6, current_db = $2,
         classification = CASE WHEN $5 THEN NULL WHEN $3::text IS NOT NULL THEN $3 ELSE classification END,
         confidence = CASE WHEN $5 THEN NULL WHEN $3::text IS NOT NULL THEN $4 ELSE confidence END,
         updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, current_db, classification ?? null, confidence ?? null, Boolean(clearClassification), seenAt]
  );
  return rows[0] || null;
}

// Starts an above-critical streak at `since` (app clock). Only sets it if
// no streak is running yet.
export async function startMonitoring(tableId, since) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET monitoring_since = COALESCE(monitoring_since, $2), updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, since]
  );
  return rows[0] || null;
}

// Restarts a streak from `since` (used after a gap in readings).
export async function restartMonitoring(tableId, since) {
  const { rows } = await query(
    `UPDATE sensor_status SET monitoring_since = $2, updated_at = NOW() WHERE table_id = $1 RETURNING *`,
    [tableId, since]
  );
  return rows[0] || null;
}

// A streak that never reached confirmation_seconds dropped back down —
// clear it with no incident created.
export async function clearMonitoring(tableId) {
  const { rows } = await query(
    `UPDATE sensor_status SET monitoring_since = NULL, updated_at = NOW() WHERE table_id = $1 RETURNING *`,
    [tableId]
  );
  return rows[0] || null;
}

// The streak was sustained for >= confirmation_seconds: latch the critical
// bulb on and remember which incident it corresponds to.
export async function confirmCritical(tableId, incidentId) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET led_critical = TRUE, active_incident_id = $2, updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, incidentId]
  );
  return rows[0] || null;
}

// The reading dropped back below critical_threshold after a confirmed
// incident: turn the bulb off and clear the streak/incident pointer.
export async function clearCritical(tableId) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET led_critical = FALSE, monitoring_since = NULL, active_incident_id = NULL, updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId]
  );
  return rows[0] || null;
}

// Marks that an audio-classification request was just sent, so the
// throttle in telemetryService.js knows not to ask again immediately.
export async function markAudioRequested(tableId) {
  const { rows } = await query(
    `UPDATE sensor_status SET last_audio_requested_at = NOW(), updated_at = NOW() WHERE table_id = $1 RETURNING *`,
    [tableId]
  );
  return rows[0] || null;
}

// Stores the result of a YAMNet classification once the ML service returns
// one for a submitted audio clip. Separate from recordTelemetry() because
// this arrives asynchronously, on its own schedule (only when audio was
// actually requested), not on every dB reading.
export async function recordClassification(tableId, { classification, confidence }) {
  const { rows } = await query(
    `UPDATE sensor_status SET classification = $2, confidence = $3, updated_at = NOW() WHERE table_id = $1 RETURNING *`,
    [tableId, classification, confidence]
  );
  return rows[0] || null;
}
// A node stopped publishing (MQTT Last Will fired). A confirmed critical
// bulb is left alone (the noise may not have stopped), but an unconfirmed
// streak is cancelled: we can't know the noise was sustained while offline.
export async function setOffline(tableId) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET is_online = FALSE,
         monitoring_since = CASE WHEN led_critical THEN monitoring_since ELSE NULL END,
         updated_at = NOW()
     WHERE table_id = $1 RETURNING *`,
    [tableId]
  );
  return rows[0] || null;
}
