// Same rules as the server (server/src/utils/validate.js), so users see
// problems before sending the form. The server still checks everything.

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function passwordIssue(value) {
  if (!value || value.length < 8) return "Password must be at least 8 characters.";
  if (new TextEncoder().encode(value).length > 72) return "Password must be 72 bytes or fewer.";
  return null;
}

export function thresholdIssue(warning, critical) {
  const w = Number(warning);
  const c = Number(critical);
  if (!Number.isFinite(w) || !Number.isFinite(c)) return "Enter numeric threshold values.";
  if (w < 0 || c > 150) return "Thresholds must be between 0 and 150 dB.";
  if (w >= c) return "Warning threshold must be less than the critical threshold.";
  return null;
}

export function confirmationDurationIssue(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3600) return "Confirmation duration must be a whole number from 0 to 3600 seconds.";
  return null;
}

export function tableNumberIssue(value) {
  const n = Number(value);
  if (value === "" || !Number.isInteger(n) || n < 1 || n > 9999) return "Table number must be a whole number from 1 to 9999.";
  return null;
}

export function sensorNodeIssue(value) {
  if (!String(value || "").trim()) return "Sensor node ID is required.";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(value).trim())) return "Use only letters, numbers, - and _ (e.g. NODE-008).";
  return null;
}

export function duplicateTableIssue(tables, { tableNumber, sensorNodeId, excludeId }) {
  const clash = tables.find(
    t =>
      t.id !== excludeId &&
      (String(t.table_number) === String(tableNumber) || String(t.sensor_node_id).toLowerCase() === String(sensorNodeId).toLowerCase())
  );
  if (!clash) return null;
  return String(clash.table_number) === String(tableNumber) ? "That table number is already in use." : "That sensor node ID is already in use.";
}
