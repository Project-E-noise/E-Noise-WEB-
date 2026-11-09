import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import * as incidentsModel from "../models/incidentsModel.js";
import * as violationsModel from "../models/violationsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import { toCsv } from "../utils/csv.js";
import * as check from "../utils/validate.js";

const NUMERIC_COLUMNS = new Set(["db_level", "confidence", "warning_threshold", "critical_threshold"]);

// Each export type: how to load the rows (with filters) and which columns to write.
const EXPORTS = {
  readings: {
    filename: "noise_readings",
    load: filters => noiseReadingsModel.findForExport(filters),
    columns: ["id", "table_id", "table_number", "db_level", "classification", "confidence", "recorded_at"]
  },
  incidents: {
    filename: "incidents",
    load: filters => incidentsModel.findAll(filters),
    columns: ["id", "table_id", "table_number", "occupant_id", "occupant_name", "category", "db_level", "confidence",
      "duration_seconds", "bulb_triggered", "status", "notes", "occurred_at"]
  },
  violations: {
    filename: "violations",
    load: filters => violationsModel.findAll(filters),
    columns: ["id", "occupant_id", "occupant_name", "incident_id", "table_id", "table_number", "violation_number", "created_at"]
  },
  tables: {
    filename: "tables",
    // Table configuration has no dates; only the table filter applies.
    load: async ({ table_id }) => (await tablesModel.findAll()).filter(t => !table_id || t.id === table_id),
    columns: ["id", "table_number", "sensor_node_id", "description", "warning_threshold", "critical_threshold", "confirmation_seconds", "status"]
  }
};

/**
 * Builds an export file. Query params: from/to or range (dates),
 * table_id, format=csv|json. Returns { filename, contentType, body }.
 */
export async function buildExport(type, query = {}) {
  const config = EXPORTS[type];
  const format = query.format === undefined ? "csv" : check.oneOf(query.format, "format", ["csv", "json"]);
  const filters = { ...check.dateRange(query), table_id: check.optionalId(query.table_id, "table_id") };

  // Postgres NUMERIC columns arrive as strings; turn them back into numbers.
  const value = (column, v) => (v != null && NUMERIC_COLUMNS.has(column) ? Number(v) : v ?? null);
  const rows = (await config.load(filters)).map(row => Object.fromEntries(config.columns.map(c => [c, value(c, row[c])])));

  if (format === "json") {
    return { filename: `${config.filename}.json`, contentType: "application/json; charset=utf-8", body: JSON.stringify(rows, null, 2) };
  }
  const csv = toCsv(rows, config.columns.map(c => ({ label: c, value: c })));
  return { filename: `${config.filename}.csv`, contentType: "text/csv; charset=utf-8", body: csv };
}
