import { Router } from "express";
import * as analyticsController from "../controllers/analyticsController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/overview", analyticsController.overview);
router.get("/incidents", analyticsController.incidents);
router.get("/noise-trends", analyticsController.noiseTrends);

export default router;
