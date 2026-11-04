export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function passwordIssue(value) {
  if (!value || value.length < 8) return "Password must be at least 8 characters.";
  return null;
}

export function thresholdIssue(warning, critical) {
  const w = Number(warning);
  const c = Number(critical);
  if (!Number.isFinite(w) || !Number.isFinite(c)) return "Enter numeric threshold values.";
  if (w >= c) return "Warning threshold must be less than the critical threshold.";
  return null;
}

export function confirmationDurationIssue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "Confirmation duration must be 0 or greater.";
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
