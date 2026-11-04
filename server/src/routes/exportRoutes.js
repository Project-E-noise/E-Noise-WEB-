import { Router } from "express";
import * as exportController from "../controllers/exportController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/readings", exportController.readings);
router.get("/incidents", exportController.incidents);
router.get("/violations", exportController.violations);
router.get("/tables", exportController.tables);

export default router;
