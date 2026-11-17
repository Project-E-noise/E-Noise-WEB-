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

// touchLastSeen = false keeps the old last_seen (used for retained status
// messages, which don't prove the node is alive right now).
export async function setOnline(tableId, isOnline, { touchLastSeen = true } = {}) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET is_online = $2, last_seen = CASE WHEN $3 THEN NOW() ELSE last_seen END, updated_at = NOW()
     WHERE table_id = $1 RETURNING *`,
    [tableId, isOnline, touchLastSeen]
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

// ---- Loud-streak state (used by telemetryService's confirmation engine) ----
// A streak is a run of readings at/above the critical threshold, allowing
// short dips. All times are the app clock, like last_seen.

// Starts a new streak at `since` with an empty label list.
export async function startStreak(tableId, since, dbLevel) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET monitoring_since = $2, last_loud_at = $2, peak_db = $3, streak_labels = '[]'::jsonb,
         led_critical = FALSE, active_incident_id = NULL, updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, since, dbLevel]
  );
  return rows[0] || null;
}

// Another loud reading in the running streak: remember when, and the peak.
export async function continueStreak(tableId, at, dbLevel) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET last_loud_at = $2, peak_db = GREATEST(COALESCE(peak_db, $3), $3), updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, at, dbLevel]
  );
  return rows[0] || null;
}

// The streak was decided while it was still going: remember the incident
// (so the same streak can't create a second one) and the bulb state.
export async function markStreakDecided(tableId, incidentId, ledCritical) {
  const { rows } = await query(
    `UPDATE sensor_status SET active_incident_id = $2, led_critical = $3, updated_at = NOW()
     WHERE table_id = $1 RETURNING *`,
    [tableId, incidentId, Boolean(ledCritical)]
  );
  return rows[0] || null;
}

// The streak is over (quiet, dropout, or decided after it ended). Clears
// all streak state and the bulb. cooldownUntil (or null to keep the
// current value) blocks new streaks until then.
export async function endStreak(tableId, cooldownUntil = null) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET monitoring_since = NULL, last_loud_at = NULL, peak_db = NULL, streak_labels = '[]'::jsonb,
         led_critical = FALSE, active_incident_id = NULL,
         cooldown_until = COALESCE($2, cooldown_until), updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, cooldownUntil]
  );
  return rows[0] || null;
}

// Marks that an audio clip was just requested (app clock), for the
// 5-second throttle and the "only accept audio we asked for" check.
export async function markAudioRequested(tableId, at = new Date().toISOString()) {
  const { rows } = await query(
    `UPDATE sensor_status SET last_audio_requested_at = $2, updated_at = NOW() WHERE table_id = $1 RETURNING *`,
    [tableId, at]
  );
  return rows[0] || null;
}

/**
 * Stores an ML result. The label is shown on the dashboard, and if a
 * streak is running it is appended to streak_labels in the same UPDATE, so
 * two clips finishing at the same moment can't overwrite each other.
 */
export async function appendStreakLabel(tableId, { category, confidence, top_class, at }) {
  const label = JSON.stringify([{ category, confidence, top_class: top_class ?? null, at }]);
  const { rows } = await query(
    `UPDATE sensor_status
     SET classification = $2, confidence = $3,
         streak_labels = CASE WHEN monitoring_since IS NOT NULL AND active_incident_id IS NULL
                              THEN streak_labels || $4::jsonb ELSE streak_labels END,
         updated_at = NOW()
     WHERE table_id = $1
     RETURNING *`,
    [tableId, category, confidence, label]
  );
  return rows[0] || null;
}

// A node stopped publishing (MQTT Last Will fired). A decided streak is
// left alone (the reading-gap check ends it when the node is back), but an
// undecided streak is discarded: we can't know the noise lasted.
export async function setOffline(tableId) {
  const { rows } = await query(
    `UPDATE sensor_status
     SET is_online = FALSE,
         monitoring_since = CASE WHEN active_incident_id IS NOT NULL THEN monitoring_since ELSE NULL END,
         last_loud_at = CASE WHEN active_incident_id IS NOT NULL THEN last_loud_at ELSE NULL END,
         peak_db = CASE WHEN active_incident_id IS NOT NULL THEN peak_db ELSE NULL END,
         streak_labels = CASE WHEN active_incident_id IS NOT NULL THEN streak_labels ELSE '[]'::jsonb END,
         updated_at = NOW()
     WHERE table_id = $1 RETURNING *`,
    [tableId]
  );
  return rows[0] || null;
}
