import { Router } from "express";
import * as systemController from "../controllers/systemController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/status", systemController.status);

export default router;
