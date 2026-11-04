import { asyncHandler } from "../utils/asyncHandler.js";
import * as analyticsService from "../services/analyticsService.js";

export const overview = asyncHandler(async (req, res) => res.json(await analyticsService.overview(req.query)));
export const incidents = asyncHandler(async (req, res) => res.json(await analyticsService.incidentsBreakdown(req.query)));
export const noiseTrends = asyncHandler(async (req, res) => res.json(await analyticsService.noiseTrends(req.query)));
