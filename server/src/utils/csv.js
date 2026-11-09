// Turns rows into CSV text.
//
// Safety: a cell that starts with = + - @ (or tab / carriage return) can be
// run as a formula when the file is opened in Excel or Google Sheets
// ("CSV injection"). Such text cells get a leading ' so they show as plain
// text. Real numbers (like -3.5) are left alone.
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  let s = String(value);
  if (typeof value !== "number" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const header = columns.map(c => escapeCell(c.label)).join(",");
  const lines = rows.map(row => columns.map(c => escapeCell(typeof c.value === "function" ? c.value(row) : row[c.value])).join(","));
  return [header, ...lines].join("\r\n");
}
