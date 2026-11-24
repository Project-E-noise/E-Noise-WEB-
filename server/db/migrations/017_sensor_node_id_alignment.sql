-- Align table node IDs with the NODE-001 ... NODE-007 firmware/seed scheme.
-- Existing table settings and live sensor state are preserved. Missing table
-- configuration rows are created without occupants, readings, or incidents.

INSERT INTO tables (
  table_number,
  sensor_node_id,
  description,
  warning_threshold,
  critical_threshold,
  confirmation_seconds,
  status
)
SELECT
  n,
  'NODE-' || LPAD(n::text, 3, '0'),
  '',
  CASE WHEN n <= 4 THEN 50 ELSE 48 END,
  CASE WHEN n <= 4 THEN 60 ELSE 58 END,
  10,
  CASE WHEN n = 7 THEN 'PAUSED' ELSE 'AVAILABLE' END
FROM generate_series(1, 7) AS n
ON CONFLICT (table_number) DO UPDATE
SET sensor_node_id = EXCLUDED.sensor_node_id;

-- New configuration rows start offline. Existing status/heartbeat rows stay
-- untouched so a live node does not get marked offline by this migration.
INSERT INTO sensor_status (table_id, is_online, last_seen)
SELECT id, FALSE, NULL
FROM tables
WHERE table_number BETWEEN 1 AND 7
ON CONFLICT (table_id) DO NOTHING;
