import { asyncHandler } from "../utils/asyncHandler.js";
import * as incidentsService from "../services/incidentsService.js";
import { broadcastIncidentCreated } from "../realtime/wsServer.js";

export const list = asyncHandler(async (req, res) => res.json({ incidents: await incidentsService.listIncidents(req.query) }));
export const get = asyncHandler(async (req, res) => res.json({ incident: await incidentsService.getIncident(req.params.id) }));
export const create = asyncHandler(async (req, res) => {
  const incident = await incidentsService.createIncident(req.body);
  // Let open dashboards refresh right away.
  broadcastIncidentCreated(incident);
  res.status(201).json({ incident });
});
export const update = asyncHandler(async (req, res) => res.json({ incident: await incidentsService.updateIncident(req.params.id, req.body) }));
export const remove = asyncHandler(async (req, res) => {
  await incidentsService.deleteIncident(req.params.id);
  res.status(204).end();
});
