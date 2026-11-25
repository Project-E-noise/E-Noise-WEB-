# Changes: violation gating (branch `violation-gating`, 2026-11-17)

**Goal:** a loud reading only triggers a check. Only the violation sounds
(`Loud Conversation`, `Mobile Phone Noise`, `Music`) can become a violation.
Every other loud sound (door slam, cough, typing, air-con, traffic, chair scrape...)
is logged for review as IGNORED or UNVERIFIED, with no strike, no critical bulb and
no ban count.

The violation list is one constant: `VIOLATION_CATEGORIES` in
`server/src/data/constants.js`. To stop phone noise counting, delete
`"Mobile Phone Noise"` there (and in `capstone/src/constants.js`, which the
category-sync test checks).

Tests: `server/` 131/131 pass (`npm test`, real Postgres). `ml-service/` 16/16 pass
(`python -m unittest discover -s tests`). Dashboard `npm run build` passes. Firmware
compiles for `esp32:esp32:esp32` 3.3.12 with `--warnings all`. Nothing was run on
real hardware.

## Commits

| Phase | Commit message |
|---|---|
| 1 | Phase 1: migration 014 for violation gating |
| 2 | Phase 2: explicit YAMNet class mapping with a Music category |
| 3 | Phase 3: classification decides whether a loud streak is a violation |
| 4 | Phase 4: strikes only from CONFIRMED, daily cap, ban lift by recount |
| 5 | Phase 5: dashboard for violation gating |
| 6 | Phase 6: firmware RMS level, calibration table, broker CA check |
| 7 | Phase 7: audio request window, ML key check, admin token revocation |
| Docs | Docs, seed data, CHANGES.md and paper note |

## New settings

All are optional environment variables on the API (`server/.env`, Render).
Values marked *placeholder* are not measured. Tune them with recordings from the
study hub.

| Setting | Default | Meaning |
|---|---|---|
| `MIN_CONFIDENCE` | `0.5` (*placeholder*) | A classifier label only votes at or above this confidence (0-1). |
| `PHONE_CONFIRMATION_SECONDS` | `4` (*placeholder*) | Sustained time once a confident phone label has arrived. Never longer than the table's `confirmation_seconds`. |
| `VIOLATION_COOLDOWN_SECONDS` | `120` | No new streak on a table for this long after a decided streak ends. |
| `MAX_STRIKES_PER_DAY` | `1` | Strikes per occupant in any rolling 24 h. |
| `ADMIN_JWT_EXPIRES_IN` | `1d` | Admin session length. Client sessions keep `JWT_EXPIRES_IN` (`7d`). |
| `SENSOR_STALE_SECONDS` | `15` (was `60`) | A sensor counts as offline after this long without a reading. |
| `ML_SERVICE_URL` | dev: `http://localhost:8001`; production: empty = no classifier | In production the server refuses to start if this is set and `ML_API_KEY` is empty. |

Fixed values in code:

| Value | Where |
|---|---|
| Dip tolerance 2 s, reading-gap discard 5 s, audio re-request every 5 s, audio accepted within 10 s of a request | `server/src/services/telemetryService.js` |
| Label wait 8 s after the sustained time, only while the ML service answers | `server/src/utils/violationRules.js` |
| ML health ping every 30 s | `server/src/server.js` |
| 24 h stats cache 60 s | `server/src/services/tablesService.js` |
| Dashboard: "No data for Xs" after 5 s, chart refresh 60 s, `DB_CALIBRATED = false` | `capstone/src/constants.js`, `capstone/src/hooks/useRealtime.js` |
| Firmware: 4 kHz sampling target, at least 2000 samples per second, `CAL_TABLE` (*placeholder rows*) | `firmware/enoise_node/enoise_node.ino` |

## Database

- `014_violation_gating.sql`: adds Music to `incidents_category_check`,
  `noise_readings_classification_check` and `sensor_status_classification_check`. These
  are the auto-generated names, confirmed with `pg_constraint` before writing the
  migration. Adds IGNORED and UNVERIFIED to `incidents_status_check`. Makes
  `incidents.category` nullable, with `incidents_category_required_when_confirmed`.
  Adds `incidents.filter_reason` (CHECK on the five reasons), `top_class` and `peak_db`.
  Adds `sensor_status.last_loud_at`, `streak_labels` (jsonb, default `[]`),
  `cooldown_until` and `peak_db`.
- `015_ban_recount.sql`: `occupants.ban_strikes_since`. See the assumptions below.
- `016_admin_token_version.sql`: `admins.token_version`.

No applied migration was edited.

## Files changed

**Server**
- `src/utils/violationRules.js` (new): `decideVerdict`, `categoryDurationSeconds`, `MIN_CONFIDENCE`, `LABEL_WAIT_SECONDS`.
- `src/services/telemetryService.js`: reworked confirmation engine; `FALLBACK_CATEGORY` removed; audio request window; optional `{ now }` clock for tests.
- `src/services/mlClient.js`: keeps `top_class`, tracks health (`isMlServiceUp`, `mlHealthState`, `checkMlHealth`).
- `src/services/incidentsService.js`: category required only for CONFIRMED and must be a violation category there; accepts `top_class`, `filter_reason`, `peak_db`; occupant at the streak start; recount on leaving CONFIRMED or delete.
- `src/services/violationsService.js`: daily cap, 30-day strike window, recount and ban lift.
- `src/services/tablesService.js`: `monitoring` block for the progress bar, `cooldown_until`, 60 s stats cache.
- `src/services/authService.js`, `src/utils/tokens.js`, `src/utils/verifyAdminToken.js`, `src/controllers/authController.js`, `src/models/adminsModel.js`: token_version and 1-day admin sessions.
- `src/models/sensorStatusModel.js`: streak functions (`startStreak`, `continueStreak`, `markStreakDecided`, `endStreak`, `appendStreakLabel`); old monitoring functions removed.
- `src/models/incidentsModel.js`: new columns; analytics count CONFIRMED only.
- `src/models/violationsModel.js`: `countStrikes` with a window, `countRecent`, `countForCurrentBan`; `removeForIncident` returns the row.
- `src/models/occupantsModel.js`: `ban` keeps `ban_strikes_since`; `liftBanAfterRecount`.
- `src/models/tableAssignmentsModel.js`: `activeAt(table, time)`.
- `src/models/clientsModel.js`: the client portal does not list IGNORED or UNVERIFIED events.
- `src/controllers/systemController.js`, `src/routes/systemRoutes.js` (new), `src/routes/index.js`: `GET /api/system/status` (ML health, stale window, `db_calibrated`).
- `src/config/env.js`: new settings and the production ML key check.
- `src/data/constants.js`: five categories, `VIOLATION_CATEGORIES`, new statuses, `FILTER_REASONS`.
- `src/server.js`: ML health ping.
- `db/migrations/014`, `015`, `016` (new); `db/seed.js` (demo data follows the new rules); `.env.example`.
- Tests: `telemetry.test.js` rewritten. New: `violation-rules`, `ml-client`, `strikes`, `schema-014`, `dashboard-support`, `categories-sync`, `security`, `fake-ml.js` (helper). Adjusted: `analytics-export`, `incidents`, `roles`, `sensor-online`, `violation-retention`.

**ML service**
- `category_mapping.py`: explicit lists plus the ranges 24-31 and 132-276, and `verify_class_map()`.
- `app.py`: startup log only.
- `tests/test_category_mapping.py`, `tests/yamnet_class_map.csv` (new).
- `README.md`.

**Dashboard (`capstone/src`)**
- `pages/IncidentLogs.jsx`: three tabs, CONFIRMED-only metrics with exact category match, "Filtered today".
- `components/incidents/IncidentTable.jsx`: filtered columns and actions. `ConfirmViolationModal.jsx` (new). `IncidentModal.jsx`: category rules.
- `pages/LiveOverview.jsx`, `pages/TableMonitoring.jsx`, `pages/RealTimeFeed.jsx`: merge WebSocket payloads, ML badge, stale state, "dB (est.)".
- `hooks/useAsync.js` (`setData` takes an updater), `hooks/useRealtime.js` (`onEvent`, 60 s refresh, 4001 sign-out, merge helpers), `hooks/useTick.js`, `hooks/useSystemStatus.jsx`, `services/system.js` (new).
- `components/tables/ConfirmationProgress.jsx` (new), `LedArray.jsx`, `TableCard.jsx`: progress bar, dimmed stale LEDs, VIOLATION ring, icon and text.
- `constants.js`, `utils/formatting.js`, `styles.css`, `pages/Analytics.jsx` (labels).

**Firmware**
- `enoise_node.ino`: RMS over the full second, mean removed, `analogReadMilliVolts`, ADC1 check, skip short windows, `CAL_TABLE`, `setCACert` with NTP.
- `secrets.example.h`: `MQTT_CA_CERT` and per-node credentials.

**Docs:** `README.md`, `HANDOFF.md`, `docs/HARDWARE_GUIDE.md`, `ml-service/README.md`, `render.yaml`, this file, `docs/PAPER_NOTE.md`.

## Assumptions and decisions

- **Neighbour crosstalk check: skipped.** The `tables` table has only a number and a
  node id, with no position or adjacency data. `neighbor_louder` is allowed in the
  `filter_reason` CHECK so it can be added later without a migration.
- **Ban recount needs one column** (`occupants.ban_strikes_since`, migration 015).
  `strikes_since` moves to the ban start when a ban begins, so without the previous
  value the server cannot tell which violations belonged to the current ban.
  Counting "the last 30 days" instead would be wrong when an earlier ban's strikes
  are still inside the window. This is not a `ban_violation_id`: the decision is
  still a recount. When a ban is lifted this way, `strikes_since` is restored, so the
  remaining strikes count again. The seat released by the ban is not given back; an
  admin reassigns it.
- **The daily cap is a rolling 24 h window**, not a calendar day, so it does not
  depend on time zones. A capped incident stays CONFIRMED and lights the bulb, but it
  creates no violation row. If the counted strike is later dismissed, the capped
  incident is not promoted to a strike.
- **A CONFIRMED incident must use a violation category**, on create and when an
  incident becomes CONFIRMED or changes category. Editing other fields of an old
  CONFIRMED "Impact Noise" row still works.
- **"Keep ignored"** moves the row to DISMISSED with a note, so the Filtered tab only
  holds events still to review. The original `filter_reason` is kept.
- **UNVERIFIED has no category.** The best guess is still stored as `top_class` and
  `confidence` for review.
- **Verdict category:** the most frequent violation category among the confident
  labels, with ties broken by the highest confidence. For IGNORED, the same rule
  applies to the non-violation labels.
- **Audio is requested only during a loud streak** (at/above critical). Before this
  change it was requested from the warning level. The dashboard's live label now
  only updates during streaks.
- **Dip tolerance:** up to two quiet readings in a row keep the streak, and a third
  ends it.
- **A streak that ends while waiting for its label** is decided when the label
  arrives or the 8 s wait runs out, with `bulb_triggered = false`. A streak that ends
  through a reading gap is always discarded.
- **Cooldown starts when a decided streak ends.** That includes a decision made after
  the streak ended, and a decided streak that ends through a reading gap.
- **ML health:** "up" means the last `/health` ping or `/classify` call succeeded. A
  4xx from `/classify`, such as a bad key, still counts as up. If the service is up
  but returns nothing for a clip, the engine waits the full 8 s, then decides
  UNVERIFIED.
- **PAUSED tables** are decided at the sustained time without waiting for a label.
  The best label is kept for review.
- **Analytics count CONFIRMED only**, as the Incident Logs metrics do. This changes
  the Analytics page for existing data with DISMISSED rows.
- **Per-node MQTT credentials:** documented in README (Security notes) and in
  `secrets.example.h`. No server code is needed. HiveMQ Serverless credentials can't
  be limited per topic; Starter and above can.
- **Token revocation is implemented** (it fit cleanly). Logging out signs that admin
  out on every device.
- **Seed data** was changed to follow the rules: the old CONFIRMED "Impact Noise"
  rows are now IGNORED, Pedro's first three strikes are on three separate days, and
  there are filtered examples for the new tab.
- **The simulator sends no audio**, so a simulated spike ends as UNVERIFIED unless an
  admin confirms it. README and HANDOFF describe the demo that way.

## Not verified

- Firmware on real hardware: the sampling rate actually reached, NTP followed by TLS
  with `setCACert`, reconnects, audio timing.
- The calibration table (placeholder rows), `MIN_CONFIDENCE` and the 4 s phone time.
- The classifier on real study-hub audio.
- The dashboard was built, not clicked through in a browser in this round.
