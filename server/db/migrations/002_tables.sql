-- Physical study-hub tables, one per ESP32 + MAX9814 sensor node.
CREATE TABLE IF NOT EXISTS tables (
  id                     SERIAL PRIMARY KEY,
  table_number           INTEGER NOT NULL UNIQUE,
  sensor_node_id         VARCHAR(100) NOT NULL UNIQUE,
  description            TEXT NOT NULL DEFAULT '',
  warning_threshold      NUMERIC(5, 2) NOT NULL DEFAULT 50,
  critical_threshold     NUMERIC(5, 2) NOT NULL DEFAULT 60,
  confirmation_seconds   INTEGER NOT NULL DEFAULT 10 CHECK (confirmation_seconds >= 0),
  status                 VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
                            CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'OFFLINE', 'PAUSED')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT thresholds_ordered CHECK (warning_threshold < critical_threshold)
);
