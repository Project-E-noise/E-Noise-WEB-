import { asyncHandler } from "../utils/asyncHandler.js";
import * as exportService from "../services/exportService.js";

// One handler per export type; each sends the file as a download.
function exportOf(type) {
  return asyncHandler(async (req, res) => {
    const file = await exportService.buildExport(type, req.query);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.send(file.body);
  });
}

export const readings = exportOf("readings");
export const incidents = exportOf("incidents");
export const violations = exportOf("violations");
export const tables = exportOf("tables");
