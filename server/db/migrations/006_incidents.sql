-- Confirmed-or-monitored excessive-noise events (the 10-second rule lives in
-- the service layer; this table just stores the outcome).
CREATE TABLE IF NOT EXISTS incidents (
  id                 SERIAL PRIMARY KEY,
  table_id           INTEGER NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  occupant_id        INTEGER REFERENCES occupants (id) ON DELETE SET NULL,
  category           VARCHAR(50) NOT NULL
                        CHECK (category IN (
                          'Loud Conversation', 'Mobile Phone Noise', 'Impact Noise', 'Ambient Baseline'
                        )),
  db_level           NUMERIC(5, 2) NOT NULL,
  confidence         NUMERIC(4, 3),
  duration_seconds   INTEGER,
  bulb_triggered     BOOLEAN NOT NULL DEFAULT FALSE,
  status             VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
                        CHECK (status IN ('MONITORING', 'CONFIRMED', 'DISMISSED')),
  notes              TEXT NOT NULL DEFAULT '',
  occurred_at        TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_table ON incidents (table_id);
CREATE INDEX IF NOT EXISTS idx_incidents_occupant ON incidents (occupant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_occurred_at ON incidents (occurred_at DESC);
