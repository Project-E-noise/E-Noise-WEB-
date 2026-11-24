-- Sensor node IDs become MQTT topic names (enoise/<node>/telemetry), so they
-- may only contain letters, digits, "-" and "_" (e.g. NODE-001). The API
-- already checks this (NODE_ID_PATTERN in src/services/tablesService.js);
-- this constraint makes the database enforce the same rule, so no other path
-- (SQL editor, scripts) can store an ID like "enoise/#" that breaks the topics.
--
-- Schema only. The 7 Studify tables are created separately and optionally by
-- `npm run db:seed:tables` (server/db/seed-tables.js).
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_sensor_node_id_format;
ALTER TABLE tables ADD CONSTRAINT tables_sensor_node_id_format
  CHECK (sensor_node_id ~ '^[A-Za-z0-9_-]{1,100}$');
