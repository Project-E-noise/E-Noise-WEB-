-- 014: violation gating.
-- * Fifth category "Music" in every category CHECK.
-- * Incident statuses IGNORED (a loud event the classifier says is not a
--   violation sound) and UNVERIFIED (loud, but no usable label).
-- * incidents.category may be NULL, except for CONFIRMED rows.
-- * Review columns on incidents: filter_reason, top_class, peak_db.
-- * Streak state on sensor_status for the reworked confirmation engine.
--
-- The constraint names below are the ones Postgres generated for the inline
-- CHECKs in migrations 005, 006 and 009 (confirmed with pg_constraint).

-- Category CHECKs ----------------------------------------------------------
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_category_check;
ALTER TABLE incidents ALTER COLUMN category DROP NOT NULL;
ALTER TABLE incidents ADD CONSTRAINT incidents_category_check
  CHECK (category IS NULL OR category IN (
    'Loud Conversation', 'Mobile Phone Noise', 'Music', 'Impact Noise', 'Ambient Baseline'
  ));

ALTER TABLE noise_readings DROP CONSTRAINT IF EXISTS noise_readings_classification_check;
ALTER TABLE noise_readings ADD CONSTRAINT noise_readings_classification_check
  CHECK (classification IS NULL OR classification IN (
    'Loud Conversation', 'Mobile Phone Noise', 'Music', 'Impact Noise', 'Ambient Baseline'
  ));

ALTER TABLE sensor_status DROP CONSTRAINT IF EXISTS sensor_status_classification_check;
ALTER TABLE sensor_status ADD CONSTRAINT sensor_status_classification_check
  CHECK (classification IS NULL OR classification IN (
    'Loud Conversation', 'Mobile Phone Noise', 'Music', 'Impact Noise', 'Ambient Baseline'
  ));

-- Incident statuses --------------------------------------------------------
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('MONITORING', 'CONFIRMED', 'DISMISSED', 'IGNORED', 'UNVERIFIED'));

-- A confirmed violation always has a category; filtered ones may not.
ALTER TABLE incidents ADD CONSTRAINT incidents_category_required_when_confirmed
  CHECK (status <> 'CONFIRMED' OR category IS NOT NULL);

-- Review columns -----------------------------------------------------------
-- Why a loud event was not confirmed (NULL for CONFIRMED / manual rows).
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS filter_reason VARCHAR(40)
  CHECK (filter_reason IS NULL OR filter_reason IN (
    'non_violation_category', 'low_confidence', 'no_classification', 'table_paused', 'neighbor_louder'
  ));
-- The raw YAMNet class behind the label (e.g. "Door", "Typing"), for review.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS top_class VARCHAR(100);
-- Loudest reading during the streak.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS peak_db NUMERIC(5, 2)
  CHECK (peak_db IS NULL OR (peak_db >= 0 AND peak_db <= 200));

CREATE INDEX IF NOT EXISTS idx_incidents_status_occurred ON incidents (status, occurred_at DESC);

-- Streak state -------------------------------------------------------------
-- Last reading at/above critical in the current streak (dip tolerance).
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS last_loud_at TIMESTAMPTZ;
-- Every ML label received during the current streak:
--   [{ "category": "...", "confidence": 0.8, "top_class": "Speech", "at": "<iso>" }, ...]
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS streak_labels JSONB NOT NULL DEFAULT '[]'::jsonb;
-- No new streak may start before this time (set after a decided streak).
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
-- Loudest reading in the current streak.
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS peak_db NUMERIC(5, 2)
  CHECK (peak_db IS NULL OR (peak_db >= 0 AND peak_db <= 200));
