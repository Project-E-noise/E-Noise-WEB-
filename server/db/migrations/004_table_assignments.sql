-- History of which occupant sat at which table. released_at IS NULL == current.
CREATE TABLE IF NOT EXISTS table_assignments (
  id             SERIAL PRIMARY KEY,
  table_id       INTEGER NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  occupant_id    INTEGER NOT NULL REFERENCES occupants (id) ON DELETE CASCADE,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at    TIMESTAMPTZ
);

-- Enforce "at most one active (unreleased) assignment per table/occupant"
-- the same way the in-memory store did, without a extra boolean column.
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_assignments_active_table
  ON table_assignments (table_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_table_assignments_active_occupant
  ON table_assignments (occupant_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_table_assignments_table ON table_assignments (table_id);
CREATE INDEX IF NOT EXISTS idx_table_assignments_occupant ON table_assignments (occupant_id);
