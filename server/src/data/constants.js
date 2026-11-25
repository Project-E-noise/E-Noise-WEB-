// Mirrors capstone/src/constants.js, the SQL CHECK constraints (migration
// 014), the firmware comments and ml-service/category_mapping.py. Keep the
// strings identical. Exactly five ML sound categories.
export const ML_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Music", "Impact Noise", "Ambient Baseline"];

// Only these categories can become a CONFIRMED violation. Every other loud
// sound is logged as IGNORED for review (no strike, no critical bulb, no
// ban count). Remove an entry here to stop it counting.
export const VIOLATION_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Music"];

// CONFIRMED  = a violation (strike, critical bulb while the streak is live)
// IGNORED    = loud, but the sound is not a violation category (or the table is paused)
// UNVERIFIED = loud, but no usable classification (ML down / low confidence)
// DISMISSED  = an admin decided it was not a violation
// MONITORING = legacy / manual: being looked at
export const INCIDENT_STATUSES = ["MONITORING", "CONFIRMED", "DISMISSED", "IGNORED", "UNVERIFIED"];
export const FILTER_REASONS = ["non_violation_category", "low_confidence", "no_classification", "table_paused", "neighbor_louder"];
export const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "OFFLINE", "PAUSED"];
export const BAN_VIOLATION_THRESHOLD = 3;
