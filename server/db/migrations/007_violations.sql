-- One row per CONFIRMED incident tied to an occupant; violation_number 3
-- triggers the one-week ban (enforced in violationsService, not here).
CREATE TABLE IF NOT EXISTS violations (
  id                  SERIAL PRIMARY KEY,
  occupant_id         INTEGER NOT NULL REFERENCES occupants (id) ON DELETE CASCADE,
  incident_id         INTEGER NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  table_id            INTEGER NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  violation_number    INTEGER NOT NULL CHECK (violation_number > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_id)
);

CREATE INDEX IF NOT EXISTS idx_violations_occupant ON violations (occupant_id, violation_number);
