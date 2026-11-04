import * as tablesModel from "../models/tablesModel.js";
import { badRequest, notFound } from "../utils/errors.js";

export async function listThresholds() {
  const tables = await tablesModel.findAll();
  return tables.map(t => ({
    table_id: t.id,
    table_number: t.table_number,
    warning_threshold: Number(t.warning_threshold),
    critical_threshold: Number(t.critical_threshold),
    confirmation_seconds: t.confirmation_seconds,
    status: t.status
  }));
}

export async function updateThreshold(tableId, payload) {
  const table = await tablesModel.findById(Number(tableId));
  if (!table) throw notFound("Table not found.");

  const warning = payload.warning_threshold != null ? Number(payload.warning_threshold) : Number(table.warning_threshold);
  const critical = payload.critical_threshold != null ? Number(payload.critical_threshold) : Number(table.critical_threshold);
  const confirmation = payload.confirmation_seconds != null ? Number(payload.confirmation_seconds) : table.confirmation_seconds;

  if (warning >= critical) throw badRequest("warning_threshold must be less than critical_threshold.");
  if (confirmation < 0) throw badRequest("confirmation_seconds must be 0 or greater.");

  const updated = await tablesModel.update(table.id, {
    table_number: table.table_number,
    sensor_node_id: table.sensor_node_id,
    description: table.description,
    status: payload.status || table.status,
    warning_threshold: warning,
    critical_threshold: critical,
    confirmation_seconds: confirmation
  });

  return {
    table_id: updated.id,
    warning_threshold: Number(updated.warning_threshold),
    critical_threshold: Number(updated.critical_threshold),
    confirmation_seconds: updated.confirmation_seconds,
    status: updated.status
  };
}
