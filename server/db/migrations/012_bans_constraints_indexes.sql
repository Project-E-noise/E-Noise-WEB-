-- 012: ban expiry + strike reset, extra data checks, and missing indexes.

-- Ban policy -----------------------------------------------------------
-- Strikes only count violations created after strikes_since. When an
-- occupant is banned, strikes_since is set to the ban start, so after the
-- ban ends they start again from 0 strikes. Violation history is kept.
ALTER TABLE occupants ADD COLUMN IF NOT EXISTS strikes_since TIMESTAMPTZ;
UPDATE occupants SET strikes_since = ban_started_at
WHERE ban_started_at IS NOT NULL AND strikes_since IS NULL;

-- Lift bans that have already ended (the app also treats them as ended
-- when it reads them, so status is never stuck on BANNED).
UPDATE occupants SET status = 'ACTIVE', updated_at = NOW()
WHERE status = 'BANNED' AND ban_until IS NOT NULL AND ban_until <= NOW();

-- A banned occupant without dates could never be un-banned, so mark any
-- such rows (only possible from old manual edits) as a one-week ban from now.
UPDATE occupants SET ban_started_at = COALESCE(ban_started_at, NOW()), ban_until = COALESCE(ban_until, NOW() + INTERVAL '7 days')
WHERE status = 'BANNED' AND (ban_started_at IS NULL OR ban_until IS NULL);

ALTER TABLE occupants ADD CONSTRAINT occupants_ban_dates
  CHECK (status <> 'BANNED' OR (ban_started_at IS NOT NULL AND ban_until IS NOT NULL AND ban_until > ban_started_at));

-- Value ranges ---------------------------------------------------------
ALTER TABLE tables ADD CONSTRAINT tables_number_positive CHECK (table_number > 0);
ALTER TABLE tables ADD CONSTRAINT tables_threshold_range
  CHECK (warning_threshold >= 0 AND critical_threshold <= 150);
ALTER TABLE tables ADD CONSTRAINT tables_confirmation_max CHECK (confirmation_seconds <= 3600);

ALTER TABLE noise_readings ADD CONSTRAINT noise_readings_db_range CHECK (db_level >= 0 AND db_level <= 200);
ALTER TABLE noise_readings ADD CONSTRAINT noise_readings_confidence_range
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

ALTER TABLE incidents ADD CONSTRAINT incidents_db_range CHECK (db_level >= 0 AND db_level <= 200);
ALTER TABLE incidents ADD CONSTRAINT incidents_confidence_range
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
ALTER TABLE incidents ADD CONSTRAINT incidents_duration_positive
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE sensor_status ADD CONSTRAINT sensor_status_confidence_range
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
ALTER TABLE sensor_status ADD CONSTRAINT sensor_status_db_range
  CHECK (current_db IS NULL OR (current_db >= 0 AND current_db <= 200));

ALTER TABLE table_assignments ADD CONSTRAINT table_assignments_release_order
  CHECK (released_at IS NULL OR released_at >= assigned_at);

-- Indexes for filters and joins ------------------------------------------
-- Analytics and exports filter readings by time across all tables.
CREATE INDEX IF NOT EXISTS idx_noise_readings_recorded ON noise_readings (recorded_at);
-- Strike counting: violations for one occupant since a date.
CREATE INDEX IF NOT EXISTS idx_violations_occupant_created ON violations (occupant_id, created_at);
-- Foreign keys used when a table or incident is deleted.
CREATE INDEX IF NOT EXISTS idx_violations_table ON violations (table_id);
CREATE INDEX IF NOT EXISTS idx_sensor_status_active_incident ON sensor_status (active_incident_id);
-- Client setup links look occupants up by token.
CREATE INDEX IF NOT EXISTS idx_occupants_verification_token ON occupants (verification_token)
  WHERE verification_token IS NOT NULL;
