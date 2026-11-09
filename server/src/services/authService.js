import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import * as adminsModel from "../models/adminsModel.js";
import { generateVerificationToken } from "../utils/tokens.js";
import { badRequest, conflict, forbidden, gone, notFound, unauthorized } from "../utils/errors.js";
import { sendVerificationEmail } from "./emailService.js";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export const publicAdmin = adminsModel.publicAdmin;

function signToken(admin, role = "admin") {
  return jwt.sign({ sub: admin.id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export async function register({ full_name, email, password }) {
  if (!full_name || !email || !password) throw badRequest("Full name, email, and password are required.");
  if (String(password).length < 8) throw badRequest("Password must be at least 8 characters.");

  const existing = await adminsModel.findByEmail(email);
  if (existing) throw conflict("An account with that email already exists.");

  const password_hash = await bcrypt.hash(password, 10);
  const verification_token = generateVerificationToken();
  const verification_token_expires_at = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();

  const admin = await adminsModel.create({ full_name, email, password_hash, verification_token, verification_token_expires_at });

  await sendVerificationEmail({ to: admin.email, verifyUrl: `${env.clientUrl}/verify-email?token=${verification_token}` });
  return { message: "Account created successfully. Please check your email and verify your account before logging in." };
}

export async function login({ email, password }) {
  const admin = await adminsModel.findByEmail(email || "");
  if (!admin) throw unauthorized("Invalid email or password.");

  const matches = await bcrypt.compare(password || "", admin.password_hash);
  if (!matches) throw unauthorized("Invalid email or password.");

  if (admin.status === "DISABLED") throw forbidden("This administrator account has been disabled.");
  if (!admin.is_verified) throw forbidden("Email verification required. Please verify your email before logging in.");

  return { token: signToken(admin), admin: publicAdmin(admin) };
}

export async function verifyEmail(token) {
  if (!token) throw badRequest("Missing verification token.");
  const admin = await adminsModel.findByVerificationToken(token);
  if (!admin) throw notFound("This verification link is invalid.");
  if (new Date(admin.verification_token_expires_at).getTime() < Date.now()) throw gone("This verification link has expired.");

  await adminsModel.markVerified(admin.id);
  return { message: "Email verified successfully. You may now log in." };
}

export async function resendVerification(email) {
  const admin = await adminsModel.findByEmail(email || "");
  // Do not reveal whether the account exists — same generic response either way.
  if (!admin || admin.is_verified) return { message: "If that account needs verification, a new email has been sent." };

  const verification_token = generateVerificationToken();
  const verification_token_expires_at = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();
  await adminsModel.setVerificationToken(admin.id, { verification_token, verification_token_expires_at });
  await sendVerificationEmail({ to: admin.email, verifyUrl: `${env.clientUrl}/verify-email?token=${verification_token}` });
  return { message: "If that account needs verification, a new email has been sent." };
}

export async function updateAdminProfile(id, { full_name }) {
  if (!full_name?.trim()) throw badRequest("Name is required.");
  if (full_name.trim().length > 100) throw badRequest("Name must be 100 characters or fewer.");
  return publicAdmin(await adminsModel.updateProfile(id, full_name.trim()));
}

export async function changeAdminPassword(id, { current_password, new_password }) {
  const admin = await adminsModel.findById(id);
  if (!admin || !await bcrypt.compare(current_password || "", admin.password_hash)) throw badRequest("Current password is incorrect.");
  if (String(new_password || "").length < 8) throw badRequest("Password must be at least 8 characters.");
  await adminsModel.updatePassword(id, await bcrypt.hash(new_password, 10));
  return { message: "Password updated." };
}
