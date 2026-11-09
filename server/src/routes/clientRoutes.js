import { Router } from "express";
import * as clientController from "../controllers/clientController.js";
import { requireClient } from "../middleware/auth.js";
import { loginLimiter, registerLimiter, emailLimiter, passwordLimiter } from "../middleware/rateLimits.js";

const router = Router();

// Public client endpoints (no login yet).
router.post("/register", registerLimiter, clientController.register);
router.post("/resend-verification", emailLimiter, clientController.resendVerification);
router.get("/verify-email", clientController.verify);
router.post("/set-password", passwordLimiter, clientController.setPassword);
router.post("/login", loginLimiter, clientController.login);

// Everything below needs a client token. Data is always scoped to that client.
router.use(requireClient);
router.get("/profile", clientController.profile);
router.patch("/profile", clientController.updateProfile);
router.post("/change-password", passwordLimiter, clientController.changePassword);
router.get("/logs", clientController.logs);
router.get("/violations", clientController.violations);
router.post("/logout", clientController.logout);

export default router;
