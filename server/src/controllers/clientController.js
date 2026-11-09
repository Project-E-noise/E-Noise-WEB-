import { asyncHandler } from "../utils/asyncHandler.js";
import * as clientService from "../services/clientService.js";

export const register = asyncHandler(async (req, res) => {
  res.status(201).json(await clientService.register(req.body));
});

export const resendVerification = asyncHandler(async (req, res) => {
  res.json(await clientService.resendVerification(req.body.email));
});

export const verify = asyncHandler(async (req, res) => {
  res.json(await clientService.verify(req.query.token));
});

export const setPassword = asyncHandler(async (req, res) => {
  res.json(await clientService.setPassword(req.body));
});

export const login = asyncHandler(async (req, res) => {
  res.json(await clientService.login(req.body));
});

export const profile = asyncHandler(async (req, res) => {
  res.json({ client: clientService.profile(req.client) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  res.json({ client: await clientService.updateProfile(req.clientId, req.body) });
});

export const changePassword = asyncHandler(async (req, res) => {
  res.json(await clientService.changePassword(req.clientId, req.body));
});

export const logs = asyncHandler(async (req, res) => {
  res.json(await clientService.logs(req.clientId, req.query));
});

export const violations = asyncHandler(async (req, res) => {
  res.json(await clientService.violations(req.clientId, req.query));
});

export const logout = asyncHandler(async (req, res) => {
  res.json({ message: "Logged out." });
});
