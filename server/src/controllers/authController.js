import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/authService.js";

export const register = asyncHandler(async (req, res) => {
  res.status(201).json(await authService.register(req.body));
});

export const login = asyncHandler(async (req, res) => {
  res.json(await authService.login(req.body));
});

export const me = asyncHandler(async (req, res) => {
  res.json({ admin: req.admin });
});

export const updateProfile = asyncHandler(async (req, res) => {
  res.json({ admin: await authService.updateAdminProfile(req.admin.id, req.body) });
});

export const changePassword = asyncHandler(async (req, res) => {
  res.json(await authService.changeAdminPassword(req.admin.id, req.body));
});

// JWTs are stateless: the browser deletes its token. A copied token stays
// valid until it expires (see JWT_EXPIRES_IN).
export const logout = asyncHandler(async (req, res) => {
  res.json({ message: "Logged out." });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  res.json(await authService.verifyEmail(req.query.token));
});

export const resendVerification = asyncHandler(async (req, res) => {
  res.json(await authService.resendVerification(req.body?.email));
});
