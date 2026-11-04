import { Router } from "express";
import * as incidentsController from "../controllers/incidentsController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", incidentsController.list);
router.post("/", incidentsController.create);
router.get("/:id", incidentsController.get);
router.put("/:id", incidentsController.update);
router.delete("/:id", incidentsController.remove);

export default router;
