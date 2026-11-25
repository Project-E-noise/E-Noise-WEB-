import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/authService.js";
import * as adminsModel from "../models/adminsModel.js";

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

// Logging out bumps the admin's token_version, so this token (and any
// other token of this admin, e.g. on another device) stops working now.
export const logout = asyncHandler(async (req, res) => {
  await adminsModel.bumpTokenVersion(req.admin.id);
  res.json({ message: "Logged out." });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  res.json(await authService.verifyEmail(req.query.token));
});

export const resendVerification = asyncHandler(async (req, res) => {
  res.json(await authService.resendVerification(req.body?.email));
});
