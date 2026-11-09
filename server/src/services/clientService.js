import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import * as clientsModel from "../models/clientsModel.js";
import * as occupantsModel from "../models/occupantsModel.js";
import { badRequest, forbidden, gone, notFound, unauthorized } from "../utils/errors.js";
import { generateVerificationToken } from "../utils/tokens.js";
import { sendVerificationEmail } from "./emailService.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  if (typeof value !== "string") throw badRequest("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 255) throw badRequest("Enter a valid email address.");
  return email;
}

function verificationData() {
  return {
    verification_token: generateVerificationToken(),
    verification_token_expires_at: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString()
  };
}

async function deliverVerification(email, token) {
  const verifyUrl = `${env.clientUrl}/client/set-password?token=${token}`;
  await sendVerificationEmail({ to: email, verifyUrl, clientSetup: true });
}

export async function register(payload = {}) {
  const email = normalizeEmail(payload.email);
  if (typeof payload.full_name !== "string" || !payload.full_name.trim()) throw badRequest("Full name is required.");
  const full_name = payload.full_name.trim();
  if (full_name.length > 100) throw badRequest("Name must be 100 characters or fewer.");
  const contact = validateContact(payload.contact ?? "");
  const generic = registrationResponse();
  const existing = await clientsModel.findByEmail(email);
  if (existing?.email_verified) return generic;

  const verification = verificationData();
  const client = existing
    ? await clientsModel.updateVerification(existing.id, verification)
    : await clientsModel.createPending({ full_name, email, contact, ...verification });
  try {
    await deliverVerification(email, client.verification_token);
  } catch (error) {
    console.error("[clientService] Verification email failed", error);
  }
  return generic;
}

function registrationResponse() {
  return { message: "If this address can receive a setup email, instructions have been sent." };
}

export async function resendVerification(value) {
  const generic = { message: "If that account needs verification, a new email has been sent." };
  let email;
  try { email = normalizeEmail(value); } catch { return generic; }
  const client = await clientsModel.findByEmail(email);
  if (!client || (client.email_verified && client.password_hash)) return generic;
  const verification = verificationData();
  const updated = await clientsModel.updateVerification(client.id, verification);
  try { await deliverVerification(email, updated.verification_token); }
  catch (error) { console.error("[clientService] Verification resend failed", error); }
  return generic;
}

export async function verify(token) {
  if (!token) throw notFound("This verification link is invalid.");
  const client = await clientsModel.byVerificationToken(token);
  if (!client) throw notFound("This verification link is invalid.");
  if (!client.verification_token_expires_at || new Date(client.verification_token_expires_at).getTime() <= Date.now()) throw gone("This verification link has expired.");
  return { valid: true };
}

export async function setPassword({ token, password } = {}) {
  if (typeof token !== "string" || !token) throw notFound("This setup link is invalid.");
  const client = await clientsModel.byVerificationToken(token);
  if (!client) throw notFound("This setup link is invalid.");
  if (!client.verification_token_expires_at || new Date(client.verification_token_expires_at).getTime() <= Date.now()) throw gone("This setup link has expired.");
  if (client.email_verified && client.password_hash) throw notFound("This setup link is invalid.");
  if (typeof password !== "string" || password.length < 8) throw badRequest("Password must be at least 8 characters.");
  if (Buffer.byteLength(password, "utf8") > 72) throw badRequest("Password must be 72 bytes or fewer.");

  const password_hash = await bcrypt.hash(password, 10);
  const updated = await clientsModel.setPasswordForToken(token, password_hash);
  if (!updated) {
    const current = await clientsModel.byVerificationToken(token);
    if (current?.verification_token_expires_at && new Date(current.verification_token_expires_at).getTime() <= Date.now()) throw gone("This setup link has expired.");
    throw notFound("This setup link is invalid.");
  }
  return { message: "Password set. You may now sign in." };
}

export async function login({ email: rawEmail, password }) {
  const email = normalizeEmail(rawEmail || "");
  const client = await clientsModel.findByEmail(email);
  if (!client?.password_hash || !await bcrypt.compare(password || "", client.password_hash)) throw unauthorized("Invalid email or password.");
  if (!client.is_active) throw forbidden("This account is inactive.");
  if (!client.email_verified) throw forbidden("Email verification required.");
  return {
    token: jwt.sign({ sub: client.id, role: "client" }, env.jwtSecret, { expiresIn: env.jwtExpiresIn }),
    client: clientsModel.publicClient(client)
  };
}

export function profile(client) { return client; }

export async function updateProfile(id, payload = {}) {
  const current = await clientsModel.findById(id);
  if (!current) throw notFound("Client profile not found.");
  let full_name = current.full_name;
  if (payload.full_name !== undefined) {
    if (typeof payload.full_name !== "string") throw badRequest("Name must be text.");
    full_name = payload.full_name.trim();
    if (!full_name) throw badRequest("Name is required.");
    if (full_name.length > 100) throw badRequest("Name must be 100 characters or fewer.");
  }
  const contact = payload.contact === undefined ? (current.contact || "") : validateContact(payload.contact);
  return clientsModel.publicClient(await clientsModel.update(id, { full_name, contact }));
}

function validateContact(contact) {
  if (typeof contact !== "string") throw badRequest("Contact must be text.");
  const value = contact.trim();
  if (value.length > 100) throw badRequest("Contact must be 100 characters or fewer.");
  return value;
}

export async function changePassword(id, { current_password, new_password } = {}) {
  const client = await clientsModel.findById(id);
  if (!client || !await bcrypt.compare(current_password || "", client.password_hash || "")) throw badRequest("Current password is incorrect.");
  if (typeof new_password !== "string" || new_password.length < 8) throw badRequest("Password must be at least 8 characters.");
  if (new_password === current_password) throw badRequest("New password must differ from the current password.");
  await clientsModel.update(id, { full_name: client.full_name, contact: client.contact || "", password_hash: await bcrypt.hash(new_password, 10) });
  return { message: "Password updated." };
}

function parseDate(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${field} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw badRequest(`${field} must be a valid date.`);
  return date;
}

function queryOptions(query = {}) {
  const fromDate = parseDate(query.from, "from");
  const toDate = parseDate(query.to, "to");
  if (fromDate && toDate && fromDate > toDate) throw badRequest("from must be on or before to.");
  const from = fromDate?.toISOString() || null;
  const to = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
  const limitValue = Number(query.limit);
  const offsetValue = Number(query.offset);
  return { from, to, limit: Math.min(Math.max(Number.isInteger(limitValue) && limitValue > 0 ? limitValue : 20, 1), 100), offset: Math.max(Number.isInteger(offsetValue) && offsetValue >= 0 ? offsetValue : 0, 0) };
}

export async function logs(id, query) {
  const options = queryOptions(query);
  const [items, total] = await Promise.all([clientsModel.logs(id, options), clientsModel.logCount(id, options)]);
  return { items, total, limit: options.limit, offset: options.offset };
}

export async function violations(id, query) {
  const options = queryOptions(query);
  const [items, total, current_violation_count, occupant] = await Promise.all([
    clientsModel.violations(id, options),
    clientsModel.filteredViolationCount(id, options),
    clientsModel.currentViolationCount(id),
    occupantsModel.findById(id)
  ]);
  const is_banned = occupant?.status === "BANNED" && occupant.ban_until && new Date(occupant.ban_until).getTime() > Date.now();
  return { items, total, current_violation_count, limit: 3, is_banned: Boolean(is_banned), ban_until: is_banned ? occupant.ban_until : null, page_limit: options.limit, offset: options.offset };
}
