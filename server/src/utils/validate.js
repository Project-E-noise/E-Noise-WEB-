// Small input-checking helpers used by the services. Each one either
// returns a clean value or throws a 400 error with a friendly message.
import { badRequest } from "./errors.js";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isBlank = value => value === undefined || value === null || value === "";

/** Required text. Trims it and checks the length. */
export function text(value, label, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string") throw badRequest(`${label} is required.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`);
  if (trimmed.length > max) throw badRequest(`${label} must be ${max} characters or fewer.`);
  return trimmed;
}

/** Optional text. Returns `fallback` when missing. */
export function optionalText(value, label, { max = 255, fallback = "" } = {}) {
  if (isBlank(value)) return fallback;
  return text(value, label, { min: 0, max });
}

export function email(value, label = "Email") {
  if (typeof value !== "string") throw badRequest("Enter a valid email address.");
  const trimmed = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(trimmed) || trimmed.length > 255) throw badRequest(`${label === "Email" ? "Enter a valid email address" : `${label} must be a valid email address`}.`);
  return trimmed;
}

/** Passwords: 8+ characters and at most 72 bytes (bcrypt ignores anything after that). */
export function password(value, label = "Password") {
  if (typeof value !== "string" || value.length < 8) throw badRequest(`${label} must be at least 8 characters.`);
  if (Buffer.byteLength(value, "utf8") > 72) throw badRequest(`${label} must be 72 bytes or fewer.`);
  return value;
}

/** A positive whole-number id, e.g. from a URL like /api/tables/:id. */
export function id(value, label = "id") {
  if (isBlank(value)) throw badRequest(`${label} is required.`);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw badRequest(`${label} must be a positive whole number.`);
  return n;
}

export function optionalId(value, label) {
  return isBlank(value) ? null : id(value, label);
}

export function number(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (isBlank(value) || typeof value === "boolean") throw badRequest(`${label} is required.`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${label} must be a number.`);
  if (integer && !Number.isInteger(n)) throw badRequest(`${label} must be a whole number.`);
  if (n < min || n > max) throw badRequest(`${label} must be between ${min} and ${max}.`);
  return n;
}

export function optionalNumber(value, label, options) {
  return isBlank(value) ? null : number(value, label, options);
}

export function oneOf(value, label, allowed) {
  if (!allowed.includes(value)) throw badRequest(`${label} must be one of: ${allowed.join(", ")}.`);
  return value;
}

export function boolean(value, label) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw badRequest(`${label} must be true or false.`);
}

/** A full date/time (ISO string). Returns an ISO string or null. */
export function optionalDateTime(value, label) {
  if (isBlank(value)) return null;
  const date = new Date(value);
  if (typeof value !== "string" || Number.isNaN(date.getTime())) throw badRequest(`${label} must be a valid date and time.`);
  return date.toISOString();
}

/** A calendar date in YYYY-MM-DD form. Returns a Date at UTC midnight or null. */
export function optionalDay(value, label) {
  if (isBlank(value)) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${label} must use the YYYY-MM-DD format.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw badRequest(`${label} must be a real date.`);
  return date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** from/to can be a full ISO date-time (used as-is) or a YYYY-MM-DD day (UTC). */
function boundary(value, label, isEnd) {
  if (typeof value === "string" && value.includes("T")) return new Date(optionalDateTime(value, label));
  const day = optionalDay(value, label);
  if (!day) return null;
  // A day used as the end is inclusive: everything before the next midnight.
  return isEnd ? new Date(day.getTime() + DAY_MS) : day;
}

/**
 * Turns query params into a { from, to } time window (ISO strings or null,
 * `to` is exclusive). Supports range=today|7d|30d|all, or from/to.
 * The dashboard sends exact ISO times computed in the browser's timezone,
 * so "today" means the viewer's local day.
 */
export function dateRange({ range, from, to } = {}) {
  if (isBlank(range) || range === "custom") {
    const fromDate = boundary(from, "from", false);
    const toDate = boundary(to, "to", true);
    if (fromDate && toDate && fromDate >= toDate) throw badRequest("The start date must be on or before the end date.");
    return { from: fromDate ? fromDate.toISOString() : null, to: toDate ? toDate.toISOString() : null };
  }

  // Shortcut ranges (UTC). The dashboard sends from/to instead.
  oneOf(range, "range", ["today", "7d", "30d", "all", "custom"]);
  if (range === "all") return { from: null, to: null };
  if (range === "today") {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: null };
  }
  const days = range === "7d" ? 7 : 30;
  return { from: new Date(Date.now() - days * DAY_MS).toISOString(), to: null };
}

/** An IANA timezone name like "Asia/Manila", used to group charts by local day. */
export function timezone(value) {
  if (isBlank(value)) return "UTC";
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(value)) throw badRequest("tz must be a timezone name like Asia/Manila.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw badRequest("tz must be a timezone name like Asia/Manila.");
  }
  return value;
}

/** limit/offset paging with safe defaults. */
export function paging({ limit, offset } = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const l = isBlank(limit) ? defaultLimit : number(limit, "limit", { min: 1, max: maxLimit, integer: true });
  const o = isBlank(offset) ? 0 : number(offset, "offset", { min: 0, max: 1000000, integer: true });
  return { limit: l, offset: o };
}
