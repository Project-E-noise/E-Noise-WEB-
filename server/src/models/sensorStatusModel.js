import { query } from "../config/db.js";

export async function findByTableId(tableId) {
  const { rows } = await query("SELECT * FROM sensor_status WHERE table_id = $1", [tableId]);
  return rows[0] || null;
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
// the latest raw reading. Does not touch the critical-confirmation columns —
// telemetryService updates those separately once it has decided what the
// confirmation state machine should do with this reading.
export async function recordTelemetry(tableId, { current_db, classification, confidence }) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET is_online = TRUE, last_seen = NOW(), current_db = $2, classification = $3, confidence = $4, updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, current_db, classification ?? null, confidence ?? null]
  );
  return rows[0] || null;
}

// Starts (or continues) an above-critical streak. Only sets monitoring_since
// the first time; safe to call on every reading while the streak continues.
export async function startMonitoring(tableId) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET monitoring_since = COALESCE(monitoring_since, NOW()), updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId]
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
// A node stopped publishing (MQTT LWT fired, or a heartbeat sweep noticed
// it went stale). Confirmed-critical state is left alone deliberately: an
// offline sensor doesn't mean the noise stopped, so we don't silently
// clear an already-confirmed incident's bulb just because the node dropped.
export async function setOffline(tableId) {
  const { rows } = await query(
    `UPDATE sensor_status SET is_online = FALSE, updated_at = NOW() WHERE table_id = $1 RETURNING *`,
    [tableId]
  );
  return rows[0] || null;
}
