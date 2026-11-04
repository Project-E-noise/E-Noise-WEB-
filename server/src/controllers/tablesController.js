import { asyncHandler } from "../utils/asyncHandler.js";
import * as tablesService from "../services/tablesService.js";

export const list = asyncHandler(async (req, res) => res.json({ tables: await tablesService.listTables() }));
export const get = asyncHandler(async (req, res) => res.json({ table: await tablesService.getTable(req.params.id) }));
export const create = asyncHandler(async (req, res) => res.status(201).json({ table: await tablesService.createTable(req.body) }));
export const update = asyncHandler(async (req, res) => res.json({ table: await tablesService.updateTable(req.params.id, req.body) }));
export const remove = asyncHandler(async (req, res) => {
  await tablesService.deleteTable(req.params.id);
  res.status(204).end();
});
export const readings = asyncHandler(async (req, res) => res.json({ readings: await tablesService.tableReadings(req.params.id, req.query) }));
export const incidents = asyncHandler(async (req, res) => res.json({ incidents: await tablesService.tableIncidents(req.params.id) }));
