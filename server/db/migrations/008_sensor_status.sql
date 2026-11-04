-- One row per table: online/offline heartbeat reported by the ESP32 node.
CREATE TABLE IF NOT EXISTS sensor_status (
  id            SERIAL PRIMARY KEY,
  table_id      INTEGER NOT NULL UNIQUE REFERENCES tables (id) ON DELETE CASCADE,
  is_online     BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
