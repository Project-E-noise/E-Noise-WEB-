import { Router } from "express";
import * as clientController from "../controllers/clientController.js";
import { requireClient } from "../middleware/auth.js";

const router = Router();

router.post("/register", clientController.register);
router.post("/resend-verification", clientController.resendVerification);
router.get("/verify-email", clientController.verify);
router.post("/set-password", clientController.setPassword);
router.post("/login", clientController.login);

router.use(requireClient);
router.get("/profile", clientController.profile);
router.patch("/profile", clientController.updateProfile);
router.post("/change-password", clientController.changePassword);
router.get("/logs", clientController.logs);
router.get("/violations", clientController.violations);
router.post("/logout", clientController.logout);

export default router;
