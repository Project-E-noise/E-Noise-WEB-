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

Noise monitoring for study-hub tables: ESP32 + MAX9814 nodes publish dB levels over MQTT; an Express/PostgreSQL API stores readings, drives the LEDs, confirms incidents after a sustained critical level, applies the 3-strike / one-week ban rule, and pushes live updates to a React dashboard over WebSocket. Clients (occupants) have their own portal. An optional YAMNet service labels loud moments.

State (2026-11-10): **working end to end locally.**
- `npm test` in `server/`: 61/61 pass against a real Postgres test DB.
- Frontend `npm run build`: no warnings (lazy routes; main chunk ~269 kB).
- Playwright click-through (Chrome, scratch script, not committed): 57/57 checks passed for every admin and client page and flow at 375 / 768 / 1280 px, with no console errors other than intentional 4xx from negative tests.
- `npm run simulate -- --node NODE-002 --spike` through the real HiveMQ broker: 126 readings stored, CONFIRMED incident after 10 s, 3rd strike banned the occupant and released their seat, critical LED cleared afterwards.
- Firmware compiles with `arduino-cli` for `esp32:esp32:esp32` (core 3.3.12, no warnings). **Not run on real hardware in this revision (unverified).**
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
- `server/db/`: `migrations/001-012`, `migrate.js` (exports `runMigrations`), `seed.js`. `server/scripts/simulate-device.js`. `server/tests/`.
- `firmware/enoise_node/`: `enoise_node.ino`, `secrets.example.h` (copy to gitignored `secrets.h`).
- `ml-service/`: `app.py`, `category_mapping.py`, `finetune_stub.py` (intentionally a stub: no labeled dataset), `Dockerfile`.
- `docs/HARDWARE_GUIDE.md`: wiring and bench tests.

## 4. How to run
See `README.md` (Local setup). Short version: create DBs `enoise` and `enoise_test`; in `server/` copy `.env.example` to `.env`, `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`; in `capstone/` copy `.env.example`, `npm install`, `npm run dev`. Demo logins: `admin@enoise.local` / `Admin@12345`, `client@enoise.local` / `Client@12345`.

Note for this machine: the developer's `server/.env` points at a local cluster in `.pgdata` on port 5433 (start it with `pg_ctl -D .pgdata -o "-p 5433" start`). The repo directory has a git "dubious ownership" warning; use `git -c safe.directory=<path> ...` or add it to safe.directory.

## 5. Key flows
- Auth: `pages/Login|Register|VerifyEmail` -> `context/AuthContext.jsx` -> `services/auth.js` -> `routes/authRoutes.js` -> `services/authService.js` -> `models/adminsModel.js`. Admin registration needs `ADMIN_SIGNUP_CODE` (disabled when empty). Token in localStorage, sent as Bearer. `middleware/auth.js`: `requireAuth` (admins only) and `requireClient` (clients only, scoped by token id).
- Client setup: `/client/register` (no password) -> email link `/client/set-password?token=` (single use, 24 h) -> `/client/login`.
- Live data: `hooks/useRealtime.js` opens `/ws?token=` and refetches on `table:update` / `incident:created`, falling back to polling. Used by Live Overview, Table Monitoring and Real-Time Feed.
- Sensor -> incident: `mqtt/mqttClient.js` (processes each node's messages in order) -> `services/telemetryService.js` (`ingestTelemetry`, confirmation engine, gap restart) -> `services/incidentsService.createIncident` (transaction: lock occupant, insert incident, `violationsService.recordViolationIfApplicable`, ban + release seat).
- Sensor online: `sensorStatusModel.EFFECTIVE_ONLINE` (is_online AND last_seen within `SENSOR_STALE_SECONDS`, default 60) is what the API returns as `is_online`. A 15 s sweep in `server.js` (`telemetryService.sweepStaleSensors`) marks silent nodes offline and broadcasts `table:update`.
- Bans: `occupantsModel.EFFECTIVE_STATUS` makes every read treat an ended ban as ACTIVE; strikes = violations after `occupants.strikes_since` (`violationsModel.countStrikes`).
- Classification: loud table -> `audio-request` -> device WAV -> `mlClient.js` (X-API-Key, 15 s timeout) -> label stored on `sensor_status`; kept until the table is quiet.

## 6. Done vs. not done
Done in this revision: input validation everywhere, consistent `{ error }` responses, helmet, rate limits, production env checks, CORS patterns, log redaction, admin invite code, ban expiry + strike reset (migration 012), CHECK constraints and indexes, export filters + JSON + CSV injection guard, SQL-side analytics with viewer timezone, telemetry fixes (gap restart, single clock, label kept, ordered processing, no deadlock), realistic idempotent seed, 61 API tests, unified responsive UI with loading/empty/error states, lazy routes, 404 page, firmware secrets.h + non-blocking reconnect with backoff, ML API key + Dockerfile, deployment docs.

Not done / open:
- Real hardware test of the new firmware (Wi-Fi/MQTT reconnect, audio timing, LEDs) - **unverified**.
- dB calibration (intentionally unchanged; marked UNCALIBRATED in the firmware).
- Classifier validation / fine-tuning (needs a labeled dataset; `finetune_stub.py` left as a stub).
- No frontend unit tests (Playwright script lived in a scratch folder; not committed).
- Actual deployment and accounts (Neon, Render, Vercel, Brevo, broker).

## 7. Known issues and gotchas
- **HiveMQ Cloud Serverless is retired on 2026-12-31** (confirmed on docs.hivemq.com). Move to HiveMQ Starter (paid) or another TLS broker (e.g. EMQX Serverless, 1 GB/month free) before then; only env values and `secrets.h` change.
- Hugging Face needs PRO to create Docker Spaces; the free ML path is a laptop + Cloudflare quick tunnel.
- Render free sleeps after 15 min idle: MQTT disconnects and readings are lost until it wakes. Use a pinger on `/health` (no DB access).
- Rate-limit counters are in memory (reset on restart). The login limit is 10 per 15 min per IP across admin and client login, which a long manual test session can hit.
- PAUSED/OFFLINE table status doesn't stop incidents (left unchanged on purpose; would be a behavior change).
- Client portal filters use UTC days; admin pages send local-time ISO ranges + `tz`.
- The simulator and firmware publish a retained `{"online":true}`. After an API restart a node whose last retained status is "online" shows online for up to 60 s, then goes offline.
- `npm run simulate` started through `npm` in Git Bash may not get Ctrl+C; use `--seconds N`.

## 8. Conventions
- Errors: services throw `badRequest/notFound/...` from `utils/errors.js`; `errorHandler` returns `{ error }`. Input checks use `utils/validate.js`.
- Multi-write operations use `withTransaction()`; models take an optional `client` argument.
- Frontend: pages call `services/*`; only `services/apiClient.js` calls `fetch`. Use components from `components/common/` and classes from `styles.css`; colors/spacing are tokens in `:root`.
- Migrations: zero-padded, applied in order, never edited after being applied.

## 9. Decisions
- Ban policy (owner's choice): bans end at `ban_until`, strikes reset after a ban, banning releases the seat, admins can lift bans early.
- Admin sign-up protected by an invite code (owner's choice).
- Exports: CSV and JSON only (owner removed XLSX to avoid a new dependency).
- Broker in docs: HiveMQ until its shutdown, with switch steps (owner's choice).
- ML stays optional and free-first (owner's choice).
- Bearer tokens in localStorage, so no CSRF token is needed (explained in README).

## 10. Demo / defense readiness
Shortest demo without hardware: run API + web app, log in as admin, open Live Overview, run `npm run simulate -- --node NODE-002 --spike --seconds 40` (needs broker credentials in `server/.env`). Expect the critical bulb, a CONFIRMED incident, and Maria (client account) banned; log in as the client to show the ban. Without a broker, demo everything else with seeded data and manually logged incidents (3 incidents on one occupant's table shows the ban).

Honest answers: dB values are uncalibrated estimates; the classifier is unvalidated; tests cover the API (61) and a browser click-through, not hardware; the WebSocket token is in the URL because browsers can't set headers there, and logs hide it.

## 11. Database migrations
001_admins, 002_tables, 003_occupants, 004_table_assignments, 005_noise_readings, 006_incidents, 007_violations, 008_sensor_status, 009_realtime_state, 010_ml_classification, 011_client_accounts, 012_bans_constraints_indexes (strikes_since, ban/constraint checks, indexes).
