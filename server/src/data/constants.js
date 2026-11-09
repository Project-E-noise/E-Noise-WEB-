// Mirrors capstone/src/constants.js, the SQL CHECK constraints, the
// firmware and ml-service/category_mapping.py. Keep the strings identical.
// Exactly four ML sound categories; do not add or remove.
export const ML_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Impact Noise", "Ambient Baseline"];
export const INCIDENT_STATUSES = ["MONITORING", "CONFIRMED", "DISMISSED"];
export const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "OFFLINE", "PAUSED"];
export const BAN_VIOLATION_THRESHOLD = 3;
export const DEFAULT_CONFIRMATION_SECONDS = 10;
