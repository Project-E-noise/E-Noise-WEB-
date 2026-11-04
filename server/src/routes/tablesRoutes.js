import { Router } from "express";
import * as tablesController from "../controllers/tablesController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", tablesController.list);
router.post("/", tablesController.create);
router.get("/:id", tablesController.get);
router.put("/:id", tablesController.update);
router.delete("/:id", tablesController.remove);
router.get("/:id/readings", tablesController.readings);
router.get("/:id/incidents", tablesController.incidents);

export default router;
