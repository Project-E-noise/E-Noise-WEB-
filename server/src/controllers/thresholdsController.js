import { asyncHandler } from "../utils/asyncHandler.js";
import * as thresholdsService from "../services/thresholdsService.js";

export const list = asyncHandler(async (req, res) => res.json({ thresholds: await thresholdsService.listThresholds() }));
export const update = asyncHandler(async (req, res) => res.json({ threshold: await thresholdsService.updateThreshold(req.params.tableId, req.body) }));
