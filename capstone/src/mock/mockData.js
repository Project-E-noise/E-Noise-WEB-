// DEV-ONLY REFERENCE DATA — never imported by services/, hooks/, or pages/.
//
// This file exists purely so a developer running the frontend without the
// backend yet can see what the expected API response shapes look like. It is
// intentionally NOT wired into the API client or any hook: the spec requires
// that the app never silently pretend a request succeeded or fabricate
// continuously-changing sensor values, so production code paths always show
// real loading/empty/error states instead of falling back to this data.
//
// If you want to exercise the UI locally before the backend exists, point
// VITE_API_BASE_URL at a small mock server (e.g. json-server) seeded from
// the shapes below, rather than importing this file into the app.

export const mockTables = Array.from({ length: 7 }).map((_, i) => ({
  id: i + 1,
  table_number: i + 1,
  sensor_node_id: `NODE-00${i + 1}`,
  description: "Studify 2nd floor",
  status: "AVAILABLE",
  current_db: 42 + i,
  avg_db: 40 + i,
  peak_db: 55 + i,
  classification: "Ambient Baseline",
  confidence: 0.9,
  violation_count: 0,
  occupant: null,
  led_state: { green: 4, yellow: 0, red: 0, critical: false },
  sensor_status: { is_online: true, last_seen: new Date().toISOString() }
}));

export const mockIncident = {
  id: 1,
  table_id: 1,
  occupant_id: null,
  category: "Loud Conversation",
  db_level: 58.4,
  confidence: 0.87,
  duration_seconds: 12,
  bulb_triggered: true,
  status: "CONFIRMED",
  notes: "",
  occurred_at: new Date().toISOString(),
  created_at: new Date().toISOString()
};

export const mockOccupant = {
  id: 1,
  full_name: "Juan Dela Cruz",
  status: "ACTIVE",
  ban_started_at: null,
  ban_until: null,
  violation_count: 0
};
