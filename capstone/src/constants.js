// Shared constants for the dashboard. The category strings must match
// server/src/data/constants.js, the SQL CHECK constraints, the firmware and
// ml-service/category_mapping.py exactly.

// Exactly five ML sound categories (migration 014 added Music).
export const ML_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Music", "Impact Noise", "Ambient Baseline"];

// Categories that can become a CONFIRMED violation. Mirrors
// server/src/data/constants.js VIOLATION_CATEGORIES (the server decides;
// the dashboard only uses this for labels and the category picker).
export const VIOLATION_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Music"];

// Statuses shown under the "Filtered" tab of Incident Logs: loud events the
// server decided were not violations (or could not verify).
export const FILTERED_STATUSES = ["IGNORED", "UNVERIFIED"];

// dB readings are estimates from an uncalibrated microphone until the
// nodes are calibrated on the bench (docs/HARDWARE_GUIDE.md). Flip this
// (and the server's db_calibrated) once they are.
export const DB_CALIBRATED = false;

// A table that reported within this many seconds is "live"; after that the
// LEDs dim and the card says "No data for Xs" (the server marks it offline
// after SENSOR_STALE_SECONDS, default 15).
export const STALE_AFTER_SECONDS = 5;

// Physical LED configuration: 5 green, 3 yellow, 2 red, 1 critical.
export const LED_CONFIG = { green: 5, yellow: 3, red: 2, critical: 1 };

// Violations: one-week temporary ban after 3 violations (enforced by the backend;
// the frontend only displays the backend-provided ban status).
export const BAN_VIOLATION_THRESHOLD = 3;

// Shown next to readings. Keep in sync with NOISE_READINGS_RETENTION_DAYS
// on the server (default 7), which deletes older raw readings every hour.
export const READINGS_RETENTION_NOTE = "Raw noise readings are kept for 7 days.";


export const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "OFFLINE", "PAUSED"];
export const INCIDENT_STATUSES = ["MONITORING", "CONFIRMED", "DISMISSED", "IGNORED", "UNVERIFIED"];

// Why the server filtered a loud event instead of confirming it.
export const FILTER_REASON_LABELS = {
  non_violation_category: "Not a violation sound",
  low_confidence: "Low classifier confidence",
  no_classification: "No classification received",
  table_paused: "Table is paused",
  neighbor_louder: "Neighbouring table was louder"
};

export const NAV_SECTIONS = [
  {
    group: "Monitor",
    items: [
      { to: "/overview", label: "Live Overview", icon: "ti-layout-dashboard" },
      { to: "/tables", label: "Table Monitoring", icon: "ti-table" },
      { to: "/feed", label: "Real-Time Feed", icon: "ti-activity" }
    ]
  },
  {
    group: "Management",
    items: [
      { to: "/incidents", label: "Incident Logs", icon: "ti-alert-triangle" },
      { to: "/occupants", label: "Occupants", icon: "ti-users" },
      { to: "/analytics", label: "Analytics", icon: "ti-chart-line" },
      { to: "/thresholds", label: "Thresholds", icon: "ti-adjustments-horizontal" }
    ]
  },
  {
    group: "Admin",
    items: [
      { to: "/table-configuration", label: "Table Configuration", icon: "ti-settings" },
      { to: "/export", label: "Data Export", icon: "ti-database" }
    ]
  },
  {
    group: "System",
    items: [{ to: "/profile", label: "Admin Profile", icon: "ti-user-circle" }]
  }
];
