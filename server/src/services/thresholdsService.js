import * as tablesModel from "../models/tablesModel.js";
import { TABLE_STATUSES } from "../data/constants.js";
import { badRequest, notFound } from "../utils/errors.js";
import * as check from "../utils/validate.js";

function serializeThreshold(t) {
  return {
    table_id: t.id,
    table_number: t.table_number,
    warning_threshold: Number(t.warning_threshold),
    critical_threshold: Number(t.critical_threshold),
    confirmation_seconds: t.confirmation_seconds,
    status: t.status
  };
}

export async function listThresholds() {
  return (await tablesModel.findAll()).map(serializeThreshold);
}

/** Updates one table's thresholds. Missing fields keep their current value. */
export async function updateThreshold(tableId, body = {}) {
  const table = await tablesModel.findById(check.id(tableId, "Table id"));
  if (!table) throw notFound("Table not found.");

  const pick = field => (body[field] !== undefined && body[field] !== null ? body[field] : table[field]);
  const warning = check.number(pick("warning_threshold"), "Warning threshold", { min: 0, max: 150 });
  const critical = check.number(pick("critical_threshold"), "Critical threshold", { min: 0, max: 150 });
  const confirmation = check.number(pick("confirmation_seconds"), "Confirmation duration", { min: 0, max: 3600, integer: true });
  const status = check.oneOf(pick("status"), "Status", TABLE_STATUSES);
  if (warning >= critical) throw badRequest("Warning threshold must be less than the critical threshold.");

  const updated = await tablesModel.update(table.id, {
    table_number: table.table_number,
    sensor_node_id: table.sensor_node_id,
    description: table.description,
    status,
    warning_threshold: warning,
    critical_threshold: critical,
    confirmation_seconds: confirmation
  });
  return serializeThreshold(updated);
}
