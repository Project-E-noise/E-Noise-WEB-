import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import * as incidentsModel from "../models/incidentsModel.js";
import * as violationsModel from "../models/violationsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import { toCsv } from "../utils/csv.js";

export async function readingsCsv() {
  const rows = await noiseReadingsModel.findAll();
  return toCsv(rows, [
    { label: "id", value: "id" },
    { label: "table_id", value: "table_id" },
    { label: "db_level", value: "db_level" },
    { label: "classification", value: "classification" },
    { label: "confidence", value: "confidence" },
    { label: "recorded_at", value: "recorded_at" }
  ]);
}

export async function incidentsCsv() {
  const rows = await incidentsModel.findAll();
  return toCsv(rows, [
    { label: "id", value: "id" },
    { label: "table_id", value: "table_id" },
    { label: "occupant_id", value: "occupant_id" },
    { label: "category", value: "category" },
    { label: "db_level", value: "db_level" },
    { label: "confidence", value: "confidence" },
    { label: "duration_seconds", value: "duration_seconds" },
    { label: "bulb_triggered", value: "bulb_triggered" },
    { label: "status", value: "status" },
    { label: "occurred_at", value: "occurred_at" }
  ]);
}

export async function violationsCsv() {
  const rows = await violationsModel.findAll();
  return toCsv(rows, [
    { label: "id", value: "id" },
    { label: "occupant_id", value: "occupant_id" },
    { label: "incident_id", value: "incident_id" },
    { label: "table_id", value: "table_id" },
    { label: "violation_number", value: "violation_number" },
    { label: "created_at", value: "created_at" }
  ]);
}

export async function tablesCsv() {
  const rows = await tablesModel.findAll();
  return toCsv(rows, [
    { label: "id", value: "id" },
    { label: "table_number", value: "table_number" },
    { label: "sensor_node_id", value: "sensor_node_id" },
    { label: "warning_threshold", value: "warning_threshold" },
    { label: "critical_threshold", value: "critical_threshold" },
    { label: "confirmation_seconds", value: "confirmation_seconds" },
    { label: "status", value: "status" }
  ]);
}
