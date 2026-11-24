# Instructions for the agent
- Read this file first; don't re-scan the whole repo. Open files only when a task needs them.
- Treat anything marked **unverified** as unconfirmed; verify it before relying on it.
- Never edit migrations that were already applied; add a new numbered migration.
- Keep category strings identical across JavaScript, SQL, firmware, and Python.
- Never commit `.env` files, `firmware/**/secrets.h`, or other secrets.
- Keep the layering: routes -> controllers -> services -> models; SQL only in `server/src/models/`; config in `server/src/config/`.
- Keep it simple (capstone project): no ORM, no TypeScript, no new frameworks or UI libraries.

# Project E-Noise - Handoff

## 1. Overview and current state

Noise monitoring for study-hub tables: ESP32 + MAX9814 nodes publish dB levels over MQTT; an Express/PostgreSQL API stores readings, drives the LEDs, times sustained loud streaks, asks the YAMNet service what the sound was and confirms a violation only for violation sounds (Loud Conversation, Mobile Phone Noise, Music), applies the 3-strike / one-week ban rule, and pushes live updates to a React dashboard over WebSocket. Clients (occupants) have their own portal.

Violation gating (2026-11-17, branch `violation-gating`): see `CHANGES.md` for every file, setting and assumption. Short version: a loud streak is decided by `decideVerdict()` in `server/src/utils/violationRules.js`; other loud sounds become IGNORED / UNVERIFIED incidents (no strike, no bulb) shown under Incident Logs -> Filtered.

State (2026-11-10): **working end to end locally.**
- `npm test` in `server/`: 131/131 pass against a real Postgres test DB (2026-11-17). `python -m unittest discover -s tests` in `ml-service/`: 16/16.
- Frontend `npm run build`: no warnings (lazy routes; main chunk ~269 kB).
- Playwright click-through (Chrome, scratch script, not committed): 57/57 checks passed for every admin and client page and flow at 375 / 768 / 1280 px, with no console errors other than intentional 4xx from negative tests.
- (2026-11-10, with the old `npm run simulate` script, since replaced by `tools/simulator/`) `--node NODE-002 --spike` through the real HiveMQ broker: 126 readings stored, CONFIRMED incident after 10 s, 3rd strike banned the occupant and released their seat, critical LED cleared afterwards.
- Firmware compiles with `arduino-cli` for `esp32:esp32:esp32` (core 3.3.12). The RMS sampling, `analogReadMilliVolts()`, the calibration table and `setCACert()` are **not run on real hardware (unverified)**; `CAL_TABLE` values are placeholders.
- ML service: `/classify` tested locally (401 without key, 200 with key, 400 for non-audio).
- Deployment files exist (`render.yaml`, `capstone/vercel.json`, `ml-service/Dockerfile`) but **nothing has been deployed (unverified).**

## 2. Tech stack
- Frontend: React 19, React Router 7, Vite 8, Chart.js 4 (`capstone/`).
- Backend: Node 20+, Express 4, `pg` (no ORM), jsonwebtoken (HS256), bcryptjs, helmet, express-rate-limit, MQTT.js, ws, nodemailer (SMTP, local only), Brevo HTTP API for production email.
- Tests: `node:test` + `supertest` (`server/tests/`).
- ML: Python 3.11, FastAPI, TensorFlow 2.17, TF Hub YAMNet.
- Firmware: ESP32 Arduino core 3.x, PubSubClient 2.8, ArduinoJson 7.

## 3. Folder map
- `capstone/src/`: `pages/` (one file per route, lazy-loaded in `App.jsx`), `components/common/` (FormFields, Modal, UiStates, DataTable, DateRangeFilter, Pager, PagedList, AuthLayout, ProfileForms), `components/layout/` (AppLayout with mobile menu, Sidebar, ClientLayout), `hooks/` (useAsync, useRealtime, useTables...), `services/` (apiClient + one file per API area), `utils/` (dates, formatting, validation), `styles.css` (design tokens in `:root`).
- `server/src/`: `config/` (env, db, dbConfig for SSL), `middleware/` (auth, errorHandler, rateLimits), `routes/`, `controllers/`, `services/`, `models/`, `mqtt/`, `realtime/wsServer.js`, `utils/validate.js` (all input checks).
- `server/db/`: `migrations/001-017`, `migrate.js` (exports `runMigrations`), `seed.js` (demo data), `seed-tables.js` (`npm run db:seed:tables`: the 7 Studify tables only). `server/scripts/create-admin.js` (`npm run admin:create`). `tools/simulator/` (virtual nodes, local broker, mock ML, `run-scenarios.js`). `server/tests/` (`fake-ml.js` is a stand-in ML service for tests).
- `firmware/enoise_node/`: `enoise_node.ino`, `secrets.example.h` (copy to gitignored `secrets.h`).
- `ml-service/`: `app.py`, `category_mapping.py` (explicit class lists + verified index ranges), `tests/` (unittest + the YAMNet class map fixture), `finetune_stub.py` (intentionally a stub: no labeled dataset), `Dockerfile`.
- `docs/HARDWARE_GUIDE.md`: wiring and bench tests.

## 4. How to run
See `README.md` (Local setup). Short version: create DBs `enoise` and `enoise_test`; in `server/` copy `.env.example` to `.env`, `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`; in `capstone/` copy `.env.example`, `npm install`, `npm run dev`. Demo logins: `admin@enoise.local` / `Admin@12345`, `client@enoise.local` / `Client@12345`.

Note for this machine: the developer's `server/.env` points at a local cluster in `.pgdata` on port 5433 (start it with `pg_ctl -D .pgdata -o "-p 5433" start`). The repo directory has a git "dubious ownership" warning; use `git -c safe.directory=<path> ...` or add it to safe.directory.

## 5. Key flows
- Auth: `pages/Login|Register|VerifyEmail` -> `context/AuthContext.jsx` -> `services/auth.js` -> `routes/authRoutes.js` -> `services/authService.js` -> `models/adminsModel.js`. Admin registration needs `ADMIN_SIGNUP_CODE` (disabled when empty). Token in localStorage, sent as Bearer. `middleware/auth.js`: `requireAuth` (admins only) and `requireClient` (clients only, scoped by token id).
- Client setup: `/client/register` (no password) -> email link `/client/set-password?token=` (single use, 24 h) -> `/client/login`. This is the only way occupants are created (there is no `POST /api/occupants`). `assignOccupant` returns 409 until the occupant is `account_ready` (email verified + password set); admins can't change an occupant's email.
- Live data: `hooks/useRealtime.js` opens `/ws?token=`; pages pass `onEvent` and merge `table:update` / `incident:created` payloads into state (`useAsync.setData` takes an updater), with a full refetch on connect and every 60 s, polling as fallback, and sign-out on close code 4001. Used by Live Overview, Table Monitoring and Real-Time Feed. `hooks/useSystemStatus.jsx` polls `/api/system/status` for the "ML service offline" badge.
- Sensor -> incident: `mqtt/mqttClient.js` (processes each node's messages in order) -> `services/telemetryService.js` (`ingestTelemetry` -> `runConfirmationEngine`: streak with 2 s dip tolerance / 5 s gap discard, audio request at start + every 5 s, sustained time from `confirmation_seconds` or the phone override, up to 8 s wait for a label while `mlClient.isMlServiceUp()`, then `decideVerdict(streak_labels)`) -> `services/incidentsService.createIncident` (occupant at the streak start; transaction: lock occupant, insert incident, `violationsService.recordViolationIfApplicable` with the daily cap, ban + release seat). Only a CONFIRMED verdict decided while the streak is live sets `led_critical` / `bulb_triggered`. A decided streak sets `cooldown_until`.
- Review: `incidentsService.updateIncident` -> CONFIRMED needs a violation category and creates the strike; leaving CONFIRMED (or deleting) calls `violationsService.removeViolationForIncident`, which recounts the current ban (`violationsModel.countForCurrentBan`, `occupantsModel.liftBanAfterRecount`).
- Sensor online: `sensorStatusModel.EFFECTIVE_ONLINE` (is_online AND last_seen within `SENSOR_STALE_SECONDS`, default 15) is what the API returns as `is_online`. A 15 s sweep in `server.js` (`telemetryService.sweepStaleSensors`) marks silent nodes offline and broadcasts `table:update`.
- Bans: `occupantsModel.EFFECTIVE_STATUS` makes every read treat an ended ban as ACTIVE; strikes = violations after `occupants.strikes_since` (`violationsModel.countStrikes`).
- Retention (`services/retentionService.js`, timers in `server.js`, each runs once at startup):
  - every 24 h, `cleanupPersonalData`: older than `VIOLATION_RETENTION_DAYS` (30) -> delete violations, set `incidents.occupant_id = NULL`, delete released `table_assignments`. Active seats and bans (on the occupant row, ends at `ban_until`) are untouched.
  - every hour, `cleanupOldReadings`: delete `noise_readings` older than `NOISE_READINGS_RETENTION_DAYS` (7) in batches of 50,000.
- Consent: `POST /api/client/register` needs `consent: true` (400 otherwise) and sets `occupants.consented_at` (migration 013). Resending the setup email doesn't change it. Admins see "Consent: <date>" or "Not recorded".
- Classification: loud table -> `audio-request` (at streak start, then every 5 s) -> device WAV (accepted only within 10 s of the request) -> `mlClient.js` (X-API-Key, 15 s timeout, tracks health; `server.js` pings `/health` every 30 s) -> `sensorStatusModel.appendStreakLabel` stores the label for the dashboard and appends `{category, confidence, top_class, at}` to `sensor_status.streak_labels` in the same UPDATE while a streak is undecided.
- Admin sessions: `signSession(id, "admin", { version })` puts `admins.token_version` in the token (`tv`); `verifyAdminToken` rejects a mismatch; `POST /api/auth/logout` bumps it. Admin tokens last `ADMIN_JWT_EXPIRES_IN` (1d).

## 6. Done vs. not done
Done in this revision: input validation everywhere, consistent `{ error }` responses, helmet, rate limits, production env checks, CORS patterns, log redaction, admin invite code, ban expiry + strike reset (migration 012), CHECK constraints and indexes, export filters + JSON + CSV injection guard, SQL-side analytics with viewer timezone, telemetry fixes (gap restart, single clock, label kept, ordered processing, no deadlock), realistic idempotent seed, 67 API tests, occupant self-signup only (admins can't create occupants or change their email; unverified occupants can't be seated), 30-day violation retention (also unlinks old incidents and deletes old seat history), 7-day raw readings retention, registration consent notice + `consented_at`, unified responsive UI with loading/empty/error states, lazy routes, 404 page, firmware secrets.h + non-blocking reconnect with backoff, ML API key + Dockerfile, deployment docs.

Not done / open:
- Real hardware test of the new firmware (RMS sampling rate actually reached, Wi-Fi/MQTT reconnect with `setCACert`, NTP before TLS, audio timing, LEDs) - **unverified**.
- dB calibration: `CAL_TABLE` in the firmware holds placeholder rows; fill them from bench tests (`docs/HARDWARE_GUIDE.md`). Until then the dashboard says "dB (est.)" (`DB_CALIBRATED` in `capstone/src/constants.js`, `db_calibrated` in `/api/system/status`).
- `MIN_CONFIDENCE` (0.5) and the 4 s phone duration are placeholders to tune with study-hub recordings.
- Neighbour crosstalk check (`neighbor_louder`): needs table adjacency data that does not exist yet.
- Classifier validation / fine-tuning (needs a labeled dataset; `finetune_stub.py` left as a stub).
- No frontend unit tests (Playwright script lived in a scratch folder; not committed).
- Actual deployment and accounts (Neon, Render, Vercel, Brevo, broker).

## 7. Known issues and gotchas
- **HiveMQ Cloud Serverless is retired on 2026-12-31** (confirmed on docs.hivemq.com). Move to HiveMQ Starter (paid) or another TLS broker (e.g. EMQX Serverless, 1 GB/month free) before then; only env values and `secrets.h` change.
- Hugging Face needs PRO to create Docker Spaces; the free ML path is a laptop + Cloudflare quick tunnel.
- Render free sleeps after 15 min idle: MQTT disconnects and readings are lost until it wakes. Use a pinger on `/health` (no DB access).
- Rate-limit counters are in memory (reset on restart). The login limit is 10 per 15 min per IP across admin and client login, which a long manual test session can hit.
- A PAUSED table logs loud events as IGNORED (`table_paused`); OFFLINE status is informational.
- The daily strike cap means a CONFIRMED incident is not always a strike; the dashboard counts CONFIRMED incidents, the occupant's `strikes` counts violations.
- Logging out as admin signs that admin out on every device (token_version).
- Client portal filters use UTC days; admin pages send local-time ISO ranges + `tz`.
- Retained MQTT status messages set is_online but never update last_seen; only fresh status and telemetry count as heartbeats.

## 8. Conventions
- Errors: services throw `badRequest/notFound/...` from `utils/errors.js`; `errorHandler` returns `{ error }`. Input checks use `utils/validate.js`.
- Multi-write operations use `withTransaction()`; models take an optional `client` argument.
- Frontend: pages call `services/*`; only `services/apiClient.js` calls `fetch`. Use components from `components/common/` and classes from `styles.css`; colors/spacing are tokens in `:root`.
- Migrations: zero-padded, applied in order, never edited after being applied.

## 9. Decisions
- Ban policy (owner's choice): bans end at `ban_until`, strikes reset after a ban, banning releases the seat, admins can lift bans early. Removing a strike behind a ban recounts it (lifted below 3); at most 1 strike per occupant per rolling 24 h.
- Only Loud Conversation, Mobile Phone Noise and Music can be violations (owner's choice, `VIOLATION_CATEGORIES`); other loud sounds are logged for review.
- Admin sign-up protected by an invite code (owner's choice).
- Occupants create their own accounts; admins cannot create them, and only verified occupants with a password can be seated (owner's choice). Old rows without an email were left as they are.
- Violations are kept 30 days (`VIOLATION_RETENTION_DAYS`), then deleted; strikes therefore count only that period. After 30 days incidents also lose their occupant and released seat history is deleted (owner's choice).
- Raw noise readings are kept 7 days (`NOISE_READINGS_RETENTION_DAYS`) for Neon's free 1 GB (owner's choice). Analytics and readings exports only cover that window.
- Occupants must agree to a privacy notice (RA 10173) to register; `consented_at` records when (owner's choice).
- Exports: CSV and JSON only (owner removed XLSX to avoid a new dependency).
- Broker in docs: HiveMQ until its shutdown, with switch steps (owner's choice).
- ML stays optional and free-first (owner's choice).
- Bearer tokens in localStorage, so no CSRF token is needed (explained in README).

## 10. Demo / defense readiness
Shortest demo without hardware: run API + web app, log in as admin, open Live Overview, run `node virtual-node.js --node NODE-002 --scenario talking` from `tools/simulator/` against a local broker (see its README; no cloud accounts needed). Expect the "Loud for 6/10 s" bar, then (without the ML service or mock-ml.js) an UNVERIFIED event under Incident Logs -> Filtered with no bulb and no strike. Click "Confirm as violation", pick a category: Maria (client account) gets her 3rd strike and is banned; log in as the client to show the ban. Without a broker, demo everything else with seeded data and manually logged incidents (3 CONFIRMED incidents on one occupant's table on different days show the ban; the daily cap allows one strike per day, so set `MAX_STRIKES_PER_DAY=3` for a quick demo).

Honest answers: dB values are uncalibrated estimates; the classifier is unvalidated and its confidence threshold is a placeholder; classification now verifies a dB-triggered event (it decides whether it counts), it is not merely supplementary; tests cover the API (131) and the mapping (16), not hardware; the WebSocket token is in the URL because browsers can't set headers there, and logs hide it.

## 11. Database migrations
001_admins, 002_tables, 003_occupants, 004_table_assignments, 005_noise_readings, 006_incidents, 007_violations, 008_sensor_status, 009_realtime_state, 010_ml_classification, 011_client_accounts, 012_bans_constraints_indexes (strikes_since, ban/constraint checks, indexes), 013_occupant_consent (occupants.consented_at), 014_violation_gating (Music category, IGNORED/UNVERIFIED, nullable category, filter_reason/top_class/peak_db, streak columns), 015_ban_recount (occupants.ban_strikes_since), 016_admin_token_version (admins.token_version).
