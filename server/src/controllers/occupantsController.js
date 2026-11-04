import { asyncHandler } from "../utils/asyncHandler.js";
import * as occupantsService from "../services/occupantsService.js";

export const list = asyncHandler(async (req, res) => res.json({ occupants: await occupantsService.listOccupants(req.query) }));
export const get = asyncHandler(async (req, res) => res.json({ occupant: await occupantsService.getOccupant(req.params.id) }));
export const create = asyncHandler(async (req, res) => res.status(201).json({ occupant: await occupantsService.createOccupant(req.body) }));
export const update = asyncHandler(async (req, res) => res.json({ occupant: await occupantsService.updateOccupant(req.params.id, req.body) }));
export const remove = asyncHandler(async (req, res) => {
  await occupantsService.deleteOccupant(req.params.id);
  res.status(204).end();
});
export const assign = asyncHandler(async (req, res) => res.json({ occupant: await occupantsService.assignOccupant(req.params.id, req.body.table_id) }));
export const release = asyncHandler(async (req, res) => res.json({ occupant: await occupantsService.releaseOccupant(req.params.id) }));
export const violations = asyncHandler(async (req, res) => res.json({ violations: await occupantsService.occupantViolations(req.params.id) }));
