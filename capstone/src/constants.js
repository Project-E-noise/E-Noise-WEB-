// Shared constants for the dashboard. The category strings must match
// server/src/data/constants.js, the SQL CHECK constraints, the firmware and
// ml-service/category_mapping.py exactly.

// Exactly four ML sound categories — do not add or remove.
export const ML_CATEGORIES = ["Loud Conversation", "Mobile Phone Noise", "Impact Noise", "Ambient Baseline"];

// Physical LED configuration: 5 green, 3 yellow, 2 red, 1 critical.
export const LED_CONFIG = { green: 5, yellow: 3, red: 2, critical: 1 };

// Violations: one-week temporary ban after 3 violations (enforced by the backend;
// the frontend only displays the backend-provided ban status).
export const BAN_VIOLATION_THRESHOLD = 3;


export const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "OFFLINE", "PAUSED"];
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
