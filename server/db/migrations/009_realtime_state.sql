-- Phase 5: live device-reported state, persisted so it survives a server
-- restart between MQTT messages (not just derived from the latest
-- noise_readings row). The 10-second critical-confirmation state machine
-- lives in telemetryService.js; these columns are where it keeps state.
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS current_db NUMERIC(5, 2);
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS classification VARCHAR(50)
  CHECK (classification IS NULL OR classification IN (
    'Loud Conversation', 'Mobile Phone Noise', 'Impact Noise', 'Ambient Baseline'
  ));
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS confidence NUMERIC(4, 3);

-- TRUE only once a threshold crossing has been sustained for
-- >= tables.confirmation_seconds (the spec's "critical LED rule" — never
-- set this the instant db_level crosses critical_threshold).
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS led_critical BOOLEAN NOT NULL DEFAULT FALSE;

-- Timestamp the current above-critical streak started, or NULL when the
-- table isn't currently above its critical threshold. Used to measure the
-- 10-second confirmation window; cleared as soon as the reading drops back
-- below critical_threshold, confirmed or not.
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS monitoring_since TIMESTAMPTZ;

-- The incident row created when a streak got confirmed, so the engine can
-- avoid creating a duplicate incident while the same streak is ongoing.
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS active_incident_id INTEGER
  REFERENCES incidents (id) ON DELETE SET NULL;
