// Date helpers. The API takes exact ISO times, and the browser works out
// where "today" starts in the viewer's own timezone.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The viewer's timezone, e.g. "Asia/Manila" (sent to analytics so days line up). */
export function viewerTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "YYYY-MM-DD" (from a date input) -> local midnight as a Date. */
function parseLocalDay(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Turns a range choice into { from, to } ISO strings for the API.
 *   rangeParams("today") / ("7d") / ("30d") / ("all")
 *   rangeParams("custom", { from: "2026-05-01", to: "2026-05-07" })  (to is inclusive)
 */
export function rangeParams(range, custom = {}) {
  const now = new Date();
  if (range === "today") return { from: startOfLocalDay(now).toISOString() };
  if (range === "7d") return { from: new Date(startOfLocalDay(now).getTime() - 6 * DAY_MS).toISOString() };
  if (range === "30d") return { from: new Date(startOfLocalDay(now).getTime() - 29 * DAY_MS).toISOString() };
  if (range === "custom") {
    const params = {};
    if (custom.from) params.from = parseLocalDay(custom.from).toISOString();
    if (custom.to) params.to = new Date(parseLocalDay(custom.to).getTime() + DAY_MS - 1).toISOString();
    return params;
  }
  return {};
}

/** ISO string -> value for <input type="datetime-local"> (local time). */
export function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO string (or undefined if empty). */
export function fromDatetimeLocal(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
