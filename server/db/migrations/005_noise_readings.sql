-- Raw dB / classification samples. Phase 5 will insert these from MQTT.
CREATE TABLE IF NOT EXISTS noise_readings (
  id               SERIAL PRIMARY KEY,
  table_id         INTEGER NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  db_level         NUMERIC(5, 2) NOT NULL,
  classification   VARCHAR(50)
                      CHECK (classification IS NULL OR classification IN (
                        'Loud Conversation', 'Mobile Phone Noise', 'Impact Noise', 'Ambient Baseline'
                      )),
  confidence       NUMERIC(4, 3),
  recorded_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_noise_readings_table_recorded ON noise_readings (table_id, recorded_at DESC);
