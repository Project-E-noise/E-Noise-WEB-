export function formatDb(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : "--";
}

export function formatPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n <= 1 ? n * 100 : n) : "--";
}

export function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function tableLabel(table) {
  if (!table) return "Table";
  return `Table ${table.table_number ?? table.tableNumber ?? table.id}`;
}
