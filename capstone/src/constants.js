// Central, single-source constants for Project E-Noise.
// Keep business rules here instead of duplicating them across components.

// Exactly four ML sound categories — do not add or remove.
export const ML_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Impact Noise", "Ambient Baseline"];

// Final approved 10-indicator LED configuration: 5 green, 2 yellow, 2 red, 1 critical.
export const LED_CONFIG = { green: 5, yellow: 2, red: 2, critical: 1 };

// Violations: one-week temporary ban after 3 violations (enforced by the backend;
// the frontend only displays the backend-provided ban status).
export const BAN_VIOLATION_THRESHOLD = 3;

// Minimum sustained duration before a threshold crossing becomes a confirmed
// incident. This is a backend business rule — the frontend only displays it.
export const DEFAULT_CONFIRMATION_SECONDS = 10;

export const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "OFFLINE", "PAUSED"];
export const OCCUPANT_STATUSES = ["ACTIVE", "WARNED", "BANNED"];
export const ACCOUNT_STATES = ["UNVERIFIED", "VERIFIED", "DISABLED"];
export const INCIDENT_STATUSES = ["MONITORING", "CONFIRMED", "DISMISSED"];

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
