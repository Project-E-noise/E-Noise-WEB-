import { Router } from "express";
import * as occupantsController from "../controllers/occupantsController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", occupantsController.list);
router.post("/", occupantsController.create);
router.get("/:id", occupantsController.get);
router.put("/:id", occupantsController.update);
router.delete("/:id", occupantsController.remove);
router.post("/:id/assign", occupantsController.assign);
router.post("/:id/release", occupantsController.release);
router.get("/:id/violations", occupantsController.violations);

export default router;
