import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import * as clientsModel from "../models/clientsModel.js";
import { BAN_VIOLATION_THRESHOLD } from "../data/constants.js";
import { badRequest, forbidden, gone, notFound, unauthorized } from "../utils/errors.js";
import { generateVerificationToken, signSession } from "../utils/tokens.js";
import * as check from "../utils/validate.js";
import { sendVerificationEmail } from "./emailService.js";
import { currentStrikes } from "./violationsService.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

function verificationData() {
  return {
    verification_token: generateVerificationToken(),
    verification_token_expires_at: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString()
  };
}

async function deliverVerification(email, token) {
  try {
    await sendVerificationEmail({ to: email, verifyUrl: `${env.clientUrl}/client/set-password?token=${token}`, clientSetup: true });
  } catch (error) {
    // Don't tell the user: the response is the same whether or not the address exists.
    console.error("[clientService] Setup email failed:", error.message);
  }
}

function isExpired(client) {
  return !client.verification_token_expires_at || new Date(client.verification_token_expires_at).getTime() <= Date.now();
}

// Registration never reveals whether an email is already registered.
export async function register(body = {}) {
  const email = check.email(body.email);
  const full_name = check.text(body.full_name, "Full name", { max: 100 });
  const contact = check.optionalText(body.contact, "Contact", { max: 100 });
  const generic = { message: "If this address can receive a setup email, instructions have been sent." };

  const existing = await clientsModel.findByEmail(email);
  if (existing?.email_verified && existing.password_hash) return generic;

  // Existing occupant records (added by an admin) only get a fresh token;
  // their name and contact are not changed by a stranger registering.
  const verification = verificationData();
  const client = existing
    ? await clientsModel.updateVerification(existing.id, verification)
    : await clientsModel.createPending({ full_name, email, contact, ...verification });
  await deliverVerification(email, client.verification_token);
  return generic;
}

export async function resendVerification(value) {
  const generic = { message: "If that account needs verification, a new email has been sent." };
  if (typeof value !== "string" || !check.EMAIL_PATTERN.test(value.trim())) return generic;
  const email = value.trim().toLowerCase();

  const client = await clientsModel.findByEmail(email);
  if (!client || (client.email_verified && client.password_hash)) return generic;
  const updated = await clientsModel.updateVerification(client.id, verificationData());
  await deliverVerification(email, updated.verification_token);
  return generic;
}

/** Checks a setup link without using it up. */
export async function verify(token) {
  if (typeof token !== "string" || !token) throw notFound("This setup link is invalid.");
  const client = await clientsModel.byVerificationToken(token);
  if (!client || (client.email_verified && client.password_hash)) throw notFound("This setup link is invalid.");
  if (isExpired(client)) throw gone("This setup link has expired.");
  return { valid: true };
}

export async function setPassword(body = {}) {
  const { token } = body;
  if (typeof token !== "string" || !token) throw notFound("This setup link is invalid.");
  const client = await clientsModel.byVerificationToken(token);
  if (!client || (client.email_verified && client.password_hash)) throw notFound("This setup link is invalid.");
  if (isExpired(client)) throw gone("This setup link has expired.");
  const newPassword = check.password(body.password);

  const updated = await clientsModel.setPasswordForToken(token, await bcrypt.hash(newPassword, BCRYPT_ROUNDS));
  // The link was used or expired between the checks above and the update.
  if (!updated) throw notFound("This setup link is invalid.");
  return { message: "Password set. You may now sign in." };
}

export async function login(body = {}) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw badRequest("Enter your email and password.");

  const client = await clientsModel.findByEmail(email);
  const matches = await bcrypt.compare(password, client?.password_hash || DUMMY_HASH);
  if (!client?.password_hash || !matches) throw unauthorized("Invalid email or password.");
  if (!client.is_active) throw forbidden("This account is inactive.");
  if (!client.email_verified) throw forbidden("Email verification required.");
  return { token: signSession(client.id, "client"), client: clientsModel.publicClient(client) };
}

export function profile(client) {
  return client;
}

export async function updateProfile(id, body = {}) {
  const current = await clientsModel.findById(id);
  if (!current) throw notFound("Client profile not found.");
  const full_name = body.full_name === undefined ? current.full_name : check.text(body.full_name, "Name", { max: 100 });
  const contact = body.contact === undefined ? (current.contact || "") : check.optionalText(body.contact, "Contact", { max: 100 });
  return clientsModel.publicClient(await clientsModel.update(id, { full_name, contact }));
}

export async function changePassword(id, body = {}) {
  const client = await clientsModel.findById(id);
  if (!client || !await bcrypt.compare(String(body.current_password || ""), client.password_hash || DUMMY_HASH)) {
    throw badRequest("Current password is incorrect.");
  }
  const newPassword = check.password(body.new_password, "New password");
  if (newPassword === body.current_password) throw badRequest("New password must differ from the current password.");
  await clientsModel.update(id, { full_name: client.full_name, contact: client.contact || "", password_hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
  return { message: "Password updated." };
}

function listOptions(query = {}) {
  return { ...check.dateRange({ from: query.from, to: query.to }), ...check.paging(query) };
}

export async function logs(id, query) {
  const options = listOptions(query);
  const [items, total] = await Promise.all([clientsModel.logs(id, options), clientsModel.logCount(id, options)]);
  return { items, total, limit: options.limit, offset: options.offset };
}

export async function violations(id, query) {
  const options = listOptions(query);
  const client = await clientsModel.findById(id);
  const [items, total, strikes] = await Promise.all([
    clientsModel.violations(id, options),
    clientsModel.filteredViolationCount(id, options),
    currentStrikes(client)
  ]);
  const is_banned = client?.status === "BANNED";
  return {
    items,
    total,
    current_violation_count: strikes,
    limit: BAN_VIOLATION_THRESHOLD,
    is_banned,
    ban_until: is_banned ? client.ban_until : null,
    page_limit: options.limit,
    offset: options.offset
  };
}
