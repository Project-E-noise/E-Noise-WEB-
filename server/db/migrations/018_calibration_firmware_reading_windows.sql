-- 018: per-node calibration, firmware version, 10-second reading rows.
-- Only adds columns with defaults, so code from before this migration keeps
-- working with it (run it before deploying the new code).

-- Per-node calibration (docs/CALIBRATION.md). The API stores and judges
-- corrected = calibration_gain x raw + calibration_offset_db. With the defaults
-- (x1, +0 dB) nothing changes until a node is calibrated.
ALTER TABLE tables ADD COLUMN IF NOT EXISTS calibration_offset_db NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS calibration_gain NUMERIC(5, 3) NOT NULL DEFAULT 1;
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_calibration_range;
ALTER TABLE tables ADD CONSTRAINT tables_calibration_range
  CHECK (calibration_offset_db BETWEEN -40 AND 40 AND calibration_gain BETWEEN 0.5 AND 2);

-- Latest reading as the node sent it (before calibration), and the firmware
-- version it reported, for checking nodes from the dashboard.
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS raw_db NUMERIC(5, 2);
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(20);

-- One noise_readings row now covers up to 10 s of one table's readings:
-- db_level = their average, peak_db = the loudest, samples = how many.
-- Older rows were single readings: samples = 1, peak_db empty (= db_level).
ALTER TABLE noise_readings ADD COLUMN IF NOT EXISTS peak_db NUMERIC(5, 2);
ALTER TABLE noise_readings ADD COLUMN IF NOT EXISTS samples INTEGER NOT NULL DEFAULT 1;
ALTER TABLE noise_readings DROP CONSTRAINT IF EXISTS noise_readings_samples_positive;
ALTER TABLE noise_readings ADD CONSTRAINT noise_readings_samples_positive CHECK (samples > 0);
