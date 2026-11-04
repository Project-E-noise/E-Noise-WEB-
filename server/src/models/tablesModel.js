import { query } from "../config/db.js";

export async function findAll() {
  const { rows } = await query("SELECT * FROM tables ORDER BY table_number ASC");
  return rows;
}

export async function findById(id) {
  const { rows } = await query("SELECT * FROM tables WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function findBySensorNodeId(sensorNodeId) {
  const { rows } = await query("SELECT * FROM tables WHERE LOWER(sensor_node_id) = LOWER($1)", [sensorNodeId]);
  return rows[0] || null;
}

export async function findClash({ table_number, sensor_node_id, excludeId }) {
  const { rows } = await query(
    `SELECT * FROM tables
     WHERE ($1::int IS NULL OR id != $1)
       AND (table_number = $2 OR LOWER(sensor_node_id) = LOWER($3))
     LIMIT 1`,
    [excludeId ?? null, table_number, sensor_node_id]
  );
  return rows[0] || null;
}

export async function create({ table_number, sensor_node_id, description, status, warning_threshold, critical_threshold, confirmation_seconds }) {
  const { rows } = await query(
    `INSERT INTO tables (table_number, sensor_node_id, description, status, warning_threshold, critical_threshold, confirmation_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [table_number, sensor_node_id, description, status, warning_threshold, critical_threshold, confirmation_seconds]
  );
  return rows[0];
}

export async function update(id, { table_number, sensor_node_id, description, status, warning_threshold, critical_threshold, confirmation_seconds }) {
  const { rows } = await query(
    `UPDATE tables
     SET table_number = $2, sensor_node_id = $3, description = $4, status = $5,
         warning_threshold = $6, critical_threshold = $7, confirmation_seconds = $8, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, table_number, sensor_node_id, description, status, warning_threshold, critical_threshold, confirmation_seconds]
  );
  return rows[0];
}

export async function remove(id) {
  const { rowCount } = await query("DELETE FROM tables WHERE id = $1", [id]);
  return rowCount > 0;
}
