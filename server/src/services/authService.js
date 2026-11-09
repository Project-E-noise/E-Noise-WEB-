import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import * as adminsModel from "../models/adminsModel.js";
import { generateVerificationToken, signSession, safeEqual } from "../utils/tokens.js";
import { badRequest, conflict, forbidden, gone, notFound, unauthorized } from "../utils/errors.js";
import * as check from "../utils/validate.js";
import { sendVerificationEmail } from "./emailService.js";

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const BCRYPT_ROUNDS = 10;
// Compared against when the email is unknown, so a wrong email takes about
// as long as a wrong password (makes guessing which emails exist harder).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export const publicAdmin = adminsModel.publicAdmin;

function verifyUrl(token) {
  return `${env.clientUrl}/verify-email?token=${token}`;
}

export async function register(body = {}) {
  // Only people with the invite code can create admin accounts.
  if (!env.adminSignupCode) throw forbidden("Administrator registration is disabled. Ask an existing administrator for access.");
  if (typeof body.invite_code !== "string" || !safeEqual(body.invite_code.trim(), env.adminSignupCode)) {
    throw forbidden("The invite code is not correct.");
  }

  const full_name = check.text(body.full_name, "Full name", { max: 100 });
  const email = check.email(body.email);
  const password = check.password(body.password);

  if (await adminsModel.findByEmail(email)) throw conflict("An account with that email already exists.");

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const verification_token = generateVerificationToken();
  const verification_token_expires_at = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();

  const admin = await adminsModel.create({ full_name, email, password_hash, verification_token, verification_token_expires_at });

  try {
    await sendVerificationEmail({ to: admin.email, verifyUrl: verifyUrl(verification_token) });
  } catch (err) {
    // The account exists; the user can use "Resend verification email".
    console.error("[auth] Verification email failed:", err.message);
  }
  return { message: "Account created successfully. Please check your email and verify your account before logging in." };
}

export async function login(body = {}) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw badRequest("Enter your email and password.");

  const admin = await adminsModel.findByEmail(email);
  const matches = await bcrypt.compare(password, admin?.password_hash || DUMMY_HASH);
  if (!admin || !matches) throw unauthorized("Invalid email or password.");

  if (admin.status === "DISABLED") throw forbidden("This administrator account has been disabled.");
  if (!admin.is_verified) throw forbidden("Email verification required. Please verify your email before logging in.");

  return { token: signSession(admin.id, "admin"), admin: publicAdmin(admin) };
}

export async function verifyEmail(token) {
  if (typeof token !== "string" || !token) throw badRequest("Missing verification token.");
  const admin = await adminsModel.findByVerificationToken(token);
  if (!admin) throw notFound("This verification link is invalid.");
  if (new Date(admin.verification_token_expires_at).getTime() < Date.now()) throw gone("This verification link has expired.");

  await adminsModel.markVerified(admin.id);
  return { message: "Email verified successfully. You may now log in." };
}

export async function resendVerification(rawEmail) {
  const generic = { message: "If that account needs verification, a new email has been sent." };
  if (typeof rawEmail !== "string" || !check.EMAIL_PATTERN.test(rawEmail.trim())) return generic;

  const admin = await adminsModel.findByEmail(rawEmail.trim());
  // Same answer either way, so this can't be used to find out who has an account.
  if (!admin || admin.is_verified) return generic;

  const verification_token = generateVerificationToken();
  const verification_token_expires_at = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();
  await adminsModel.setVerificationToken(admin.id, { verification_token, verification_token_expires_at });
  try {
    await sendVerificationEmail({ to: admin.email, verifyUrl: verifyUrl(verification_token) });
  } catch (err) {
    console.error("[auth] Verification resend failed:", err.message);
  }
  return generic;
}

export async function updateAdminProfile(id, body = {}) {
  const full_name = check.text(body.full_name, "Name", { max: 100 });
  return publicAdmin(await adminsModel.updateProfile(id, full_name));
}

export async function changeAdminPassword(id, body = {}) {
  const admin = await adminsModel.findById(id);
  if (!admin || !await bcrypt.compare(String(body.current_password || ""), admin.password_hash)) {
    throw badRequest("Current password is incorrect.");
  }
  const newPassword = check.password(body.new_password, "New password");
  if (newPassword === body.current_password) throw badRequest("New password must differ from the current password.");
  await adminsModel.updatePassword(id, await bcrypt.hash(newPassword, BCRYPT_ROUNDS));
  return { message: "Password updated." };
}
