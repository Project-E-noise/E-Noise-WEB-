import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter, registerLimiter, emailLimiter, passwordLimiter } from "../middleware/rateLimits.js";

const router = Router();

router.post("/register", registerLimiter, authController.register);
router.post("/login", loginLimiter, authController.login);
router.get("/verify-email", authController.verifyEmail);
router.post("/resend-verification", emailLimiter, authController.resendVerification);
router.get("/me", requireAuth, authController.me);
router.patch("/me", requireAuth, authController.updateProfile);
router.post("/change-password", passwordLimiter, requireAuth, authController.changePassword);
router.post("/logout", requireAuth, authController.logout);

export default router;
