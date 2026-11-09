export function formatDb(value) {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n.toFixed(1) : "--";
}

/** 0.87 -> 87 (confidence is stored as 0-1). */
export function formatPercent(value) {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? Math.round(n * 100) : "--";
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = toDate(value);
  return date ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "--";
}

export function formatTime(value) {
  const date = toDate(value);
  return date ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "--";
}

export function formatDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "--";
}

export function tableLabel(table) {
  if (!table) return "Table";
  return `Table ${table.table_number ?? table.id}`;
}
