import { Router } from "express";
import * as thresholdsController from "../controllers/thresholdsController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", thresholdsController.list);
router.put("/:tableId", thresholdsController.update);

export default router;
