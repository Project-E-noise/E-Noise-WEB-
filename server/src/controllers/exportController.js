import { asyncHandler } from "../utils/asyncHandler.js";
import * as exportService from "../services/exportService.js";

function sendCsv(res, filename, csv) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export const readings = asyncHandler(async (req, res) => sendCsv(res, "noise_readings.csv", await exportService.readingsCsv()));
export const incidents = asyncHandler(async (req, res) => sendCsv(res, "incidents.csv", await exportService.incidentsCsv()));
export const violations = asyncHandler(async (req, res) => sendCsv(res, "violations.csv", await exportService.violationsCsv()));
export const tables = asyncHandler(async (req, res) => sendCsv(res, "tables.csv", await exportService.tablesCsv()));
