import { Router } from "express";
import authRoutes from "./authRoutes.js";
import tablesRoutes from "./tablesRoutes.js";
import incidentsRoutes from "./incidentsRoutes.js";
import occupantsRoutes from "./occupantsRoutes.js";
import thresholdsRoutes from "./thresholdsRoutes.js";
import analyticsRoutes from "./analyticsRoutes.js";
import exportRoutes from "./exportRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/tables", tablesRoutes);
router.use("/incidents", incidentsRoutes);
router.use("/occupants", occupantsRoutes);
router.use("/thresholds", thresholdsRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/export", exportRoutes);

export default router;
