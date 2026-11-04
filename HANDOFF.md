# Instructions for the agent
- Read this file first; don't re-scan the whole repo. Open files only when a task needs them.
- Treat anything marked **unverified** as unconfirmed; verify it before relying on it.
- Never edit migrations that were already applied; add a new numbered migration.
- Keep category strings identical across JavaScript, SQL, firmware, and Python.
- Never commit `.env` files or secrets.

# Project E-Noise — Handoff

## 1. Overview and current state

Project E-Noise is an administrator dashboard and sensing system for monitoring noise at study-hub tables. Administrators can manage tables and occupants, review readings and incidents, configure thresholds, view analytics, and export CSV data. ESP32 nodes can publish microphone-derived levels and receive LED commands. Intended users are study-hub administrators.

The repository contains a React dashboard, Express/PostgreSQL API, optional MQTT path, ESP32 firmware, and optional YAMNet classifier. Current state: **partially working / integration-dependent**. Frontend build and both local dev servers were run successfully during this revision; `/health` and the frontend root returned HTTP 200. PostgreSQL readiness, DB-backed routes, authentication, and a full demo were **unverified**. The backend logged MQTT connection errors in this run. `README.md` reports an earlier backend smoke test; that was not independently reproduced here.

## 2. Tech stack
- Frontend: JavaScript ES modules, React 19.1, React Router 7.1, Vite 8, Chart.js 4.4, react-chartjs-2 5.3 (`capstone/package.json`). Installed Vite reported 8.3.0 in the build.
- Backend: Node >=18, Express 4.19, PostgreSQL through `pg` 8.23 (no ORM), `jsonwebtoken`, bcryptjs, MQTT.js, `ws`, Nodemailer (`server/package.json`).
- ML: Python FastAPI 0.115, Uvicorn 0.30.6, TensorFlow 2.17, TensorFlow Hub 0.16, NumPy, SoundFile (`ml-service/requirements.txt`). YAMNet downloads at startup.
- Device: ESP32 Arduino C++ with PubSubClient and ArduinoJson (firmware header).
- No automated test suite or test script is declared in either npm package manifest.

## 3. Architecture and folder map
- `capstone/`: Vite frontend. `src/pages/` screens; `src/components/` shared UI; `src/context/` auth/toasts; `src/hooks/` data and realtime behavior; `src/services/` API wrappers; `src/utils/` formatting/validation.
- `server/src/`: Express API in route -> controller -> service -> model layers. `config/` env/DB; `middleware/` auth/errors; `mqtt/` device messages; `realtime/` WebSocket broadcasts.
- `server/db/migrations/`: ordered schema changes; `server/db/migrate.js` records applied files. `server/db/seed.js` inserts starter data. `server/scripts/` contains MQTT simulator.
- `ml-service/`: FastAPI/YAMNet classifier and category mapping; audio is handled in memory.
- `firmware/enoise_node/`: ESP32 firmware.

## 4. How to run

Prerequisites: Node.js >=18 and PostgreSQL. Create a database named `enoise`. From `server/`, copy `.env.example` to `.env`, set `DATABASE_URL`, then run `npm install`, `npm run db:migrate`, `npm run db:seed`, and `npm run dev`. Defaults: API `http://localhost:5000`, health endpoint `/health`.

From `capstone/`, copy `.env.example` to `.env` and set `VITE_API_BASE_URL` if the API is not at `http://localhost:5000`; run `npm install` and `npm run dev` (Vite binds `127.0.0.1:5173`). Register at `/register`. Without SMTP, verification URL is logged in the backend terminal.

Optional ML: in `ml-service/`, create/activate a Python venv, install `ml-service/requirements.txt`, then run `uvicorn app:app --port 8001`; first startup downloads YAMNet. `ML_SERVICE_URL` defaults to `http://localhost:8001`.

Optional MQTT: set HiveMQ values in backend `.env`; without a working broker, MQTT ingestion and simulator do not work. `MQTT_PROTOCOL` is also read by `server/src/mqtt/mqttClient.js` and `server/scripts/simulate-device.js` for protocol selection, but is not listed in `server/.env.example`.

Environment names present in the examples:
- `server/.env.example`: `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL`, `CLIENT_URL`, `HIVEMQ_PORT`, `ML_SERVICE_URL`. Optional/commented names: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `HIVEMQ_HOST`, `HIVEMQ_USERNAME`, `HIVEMQ_PASSWORD`.
- `capstone/.env.example`: `VITE_API_BASE_URL`.
- `MQTT_PROTOCOL` is runtime-read but absent from the server example. `TFHUB_CACHE_DIR` is mentioned in `ml-service/README.md`, not in either env example.

Scripts actually declared: server: `start`, `dev`, `db:migrate`, `db:seed`, `simulate`; frontend: `dev`, `build`, `preview`. Commands: `npm run build` and `npm run preview` from `capstone/`; `npm run simulate` or `npm run simulate -- --node NODE-001 --spike` from `server/`. No npm test command exists.

### Getting started fast

Assumes PostgreSQL is installed/running and `.env` values are configured. On Windows PowerShell, create the DB once with `createdb enoise` if that command is installed. Then use two terminals:

```powershell
cd server
Copy-Item .env.example .env # edit DATABASE_URL and set JWT_SECRET
npm.cmd install
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

```powershell
cd capstone
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

A healthy startup should print the API URL and WebSocket URL in the backend terminal, and Vite's local URL in the frontend terminal. `GET http://localhost:5000/health` should return `{"status":"ok","env":"development"}`; browser should load the E-Noise login screen at `http://127.0.0.1:5173/login`. After registration, copy the verification URL from the backend terminal, verify, then log in to see the protected dashboard/table view.

**Run status for this handoff:** these commands were not run as a complete clean setup. `npm.cmd run build` did run and passed (Vite emitted a >500 kB chunk-size warning). `npm.cmd run dev` ran for both frontend and backend; health and frontend root each returned HTTP 200. Migrations, seed, login, and database-backed UI were **not run / unverified** because PostgreSQL CLI readiness tools were unavailable. Backend logged MQTT connection errors. Initial `npm` PowerShell invocations were blocked by execution policy; `npm.cmd` worked.

## 5. Key flows
- **Admin auth:** `capstone/src/pages/Register.jsx`, `capstone/src/pages/Login.jsx`, `capstone/src/pages/VerifyEmail.jsx` -> `capstone/src/context/AuthContext.jsx` -> `capstone/src/services/auth.js` -> `capstone/src/services/apiClient.js` -> `server/src/routes/authRoutes.js` -> controllers/services -> `server/src/models/adminsModel.js`. JWT is in browser localStorage. API auth is `server/src/middleware/auth.js`; page guard is `capstone/src/components/auth/ProtectedRoute.jsx`.
- **Tables/live dashboard:** `capstone/src/pages/TableMonitoring.jsx` / `capstone/src/pages/LiveOverview.jsx` -> `capstone/src/hooks/useTables.js` and `capstone/src/services/tables.js` -> `server/src/routes/tablesRoutes.js` -> controller/service/model -> PostgreSQL. `capstone/src/hooks/useRealtime.js` uses WebSocket with polling fallback; backend broadcasts from `server/src/realtime/wsServer.js`.
- **Sensor to incident/LED:** `firmware/enoise_node/enoise_node.ino` -> `server/src/mqtt/mqttClient.js` and `server/src/mqtt/topics.js` -> `server/src/services/telemetryService.js` -> `server/src/models/noiseReadingsModel.js`, `server/src/models/sensorStatusModel.js`, and `server/src/services/incidentsService.js`. Telemetry persists readings, checks critical duration, publishes LED state, and broadcasts table/incident changes.
- **Occupants/violations:** `capstone/src/pages/Occupants.jsx` and occupant components -> `capstone/src/services/occupants.js` -> `server/src/routes/occupantsRoutes.js` -> controller/service/model. `server/src/services/incidentsService.js` handles violation/ban rules; atomic DB helper is in `server/src/config/db.js`.
- **Classification:** warning-level telemetry can request a device WAV; `server/src/services/telemetryService.js` -> `server/src/mqtt/mqttClient.js` -> `server/src/services/mlClient.js` -> `ml-service/app.py` `/classify` -> `ml-service/category_mapping.py`. Intended persistence is label/confidence only, not raw audio.

## 6. Done vs. not done
- Implemented in code: dashboard pages; API auth, tables, incidents, occupants, thresholds, analytics, exports; PostgreSQL migrations/seed; MQTT ingestion/LED response; WebSocket; optional ML; device simulator.
- SMTP, MQTT, ESP32, and ML require external setup and were not verified in this session. YAMNet mapping is a prototype without validated site-labeled audio (`ml-service/README.md`).
- `ml-service/finetune_stub.py` is not wired to inference; its labeled-data loading TODO awaits a dataset.
- `capstone/src/mock/mockData.js` contains sample data; whether any runtime path still uses it is **unverified**.
- Application scan found a TODO in the fine-tuning stub; no other TODO/FIXME markers found in the scanned app/service directories.

## 7. Known bugs and gotchas
- Missing `JWT_SECRET` generates a new secret each boot, invalidating sessions; set it for persistent sessions.
- Server can start without `DATABASE_URL`, but DB queries fail.
- Browser WebSocket sends JWT via `?token=...` (`capstone/src/services/apiClient.js`); URL exposure in deployment logs is a security consideration.
- Default CORS is localhost:5173; `CORS_ORIGIN` supports comma-separated origins.
- Critical incident fallback category is `Loud Conversation` if ML classification has not arrived (`server/src/services/telemetryService.js`); this is not necessarily a classifier result.
- Firmware dB(A)-ish conversion is uncalibrated; absolute levels are not validated measurements.
- ML output is unvalidated for this site. YAMNet chooses the strongest individual class score per category bucket; see `ml-service/README.md`.

## 8. Conventions
- Frontend: React function components/hooks; pages and hooks call `capstone/src/services/*.js`; `capstone/src/services/apiClient.js` centralizes fetch.
- Backend: ES modules and route -> controller -> service -> model. Keep parameterized SQL in `server/src/models/`; business rules in services; use `withTransaction()` for atomic multi-write operations.
- API mounts below `/api`. Filenames follow `*Routes.js`, `*Controller.js`, `*Service.js`, `*Model.js`.
- Migrations use zero-padded filenames and run in filename order. Preserve constraints and migration tracking.
- Keep category labels in `server/src/data/constants.js`, `capstone/src/constants.js`, SQL constraints, firmware expectations, and `ml-service/category_mapping.py` aligned.

## 9. Decisions and reasons recorded in code/docs
- Direct `pg` queries and small custom migration/seed scripts avoid an ORM (`server/src/config/db.js`, `README.md`).
- Critical LED/incident waits for `confirmation_seconds`; state is persisted in `sensor_status` (`server/src/services/telemetryService.js`, `server/db/migrations/009_realtime_state.sql`).
- WebSocket shares REST port at `/ws`; frontend falls back to polling (`server/src/server.js`, `capstone/src/hooks/useRealtime.js`).
- Audio is requested only above warning threshold and sent as short clips; classification is optional.
- Best individual YAMNet class score per bucket avoids catch-all Ambient Baseline winning by accumulated small scores (`ml-service/README.md`).

## 10. Demo / defense readiness

Shortest no-hardware path still requires a reachable MQTT broker: seed DB, register/verify/login, configure a table with `sensor_node_id` `NODE-001`, configure the backend and simulator with the same working HiveMQ credentials, then run from `server/`:

```powershell
npm.cmd run simulate -- --node NODE-001 --spike
```

Open Table Monitoring and Incident Logs. Simulator publishes one reading/second; `--spike` ramps above critical and holds it. With the default `confirmation_seconds` of 10, expect a confirmed incident after the sustained critical window, plus live table updates over WebSocket. Seed table IDs/node IDs and thresholds are defined in `server/db/seed.js`; confirm they match before demo. This path was **not run end-to-end**. Without a broker, there is no implemented local MQTT simulator fallback; manual incident creation can demonstrate incident UI/CRUD but not live sensor ingestion.

Demo-safe when DB setup is known-good: login/verification flow (console link), table/occupant management, manually created incidents, analytics/export against stored data. Fragile/external: simulator and live readings require broker; real sensing/LED requires ESP32; email requires SMTP; classification requires running ML service and clip-capable device. Database is required for almost all meaningful pages.

Likely panel questions and honest answers:
- **Automated tests?** “There is no automated test suite or npm test script yet; this demo path needs repeatable tests.”
- **Are dB readings calibrated?** “No; firmware produces an uncalibrated dB(A)-ish estimate and needs reference-meter calibration.”
- **Is the classifier validated?** “No; it maps general YAMNet classes and has not been evaluated on labeled site audio.”
- **Why is JWT in the WebSocket URL?** “Browser WebSocket cannot set arbitrary auth headers here, so the code uses a query token; deployment logging/exposure needs careful handling.”
- **Does the demo work offline/no broker?** “Not for live sensor updates; the simulator also publishes through MQTT and needs a broker.”

## 11. Database migrations (filename order)

`server/db/migrations/` contains:

1. `server/db/migrations/001_admins.sql`
2. `server/db/migrations/002_tables.sql`
3. `server/db/migrations/003_occupants.sql`
4. `server/db/migrations/004_table_assignments.sql`
5. `server/db/migrations/005_noise_readings.sql`
6. `server/db/migrations/006_incidents.sql`
7. `server/db/migrations/007_violations.sql`
8. `server/db/migrations/008_sensor_status.sql`
9. `server/db/migrations/009_realtime_state.sql`
10. `server/db/migrations/010_ml_classification.sql`

## 12. Likely next steps (priority order)

1. Make the demo reproducible: verify PostgreSQL setup, migrations/seed, account verification, NODE-001 mapping, broker connection, simulator spike, table updates, and incident creation; document a fallback if broker access is unavailable.
2. Add automated tests for auth, incident/ban transaction, confirmation timing/restart, MQTT parsing, and key UI flows.
3. Calibrate MAX9814/firmware against a reference meter and validate thresholds in the installation.
4. Collect consented labeled site audio and evaluate classifier performance before replacing the prototype mapping or claiming accuracy.
5. Exercise reconnect/offline and deployment settings for MQTT, WebSocket, SMTP, CORS, JWT, and ML service.

## Corrections made
- Confirmed `capstone/src/components/auth/ProtectedRoute.jsx` is the correct existing path; the prior handoff already used it. No path correction was needed for that item.
- Expanded key-flow references to explicit `capstone/` and `server/` paths and checked them against the repository. All concrete source, env-example, script, and migration paths named above exist.
- Reconciled env names and npm scripts against both `.env.example` files and package manifests; called out runtime-read `MQTT_PROTOCOL` separately because it is absent from the example.
- Added the complete verified migration filename order and amended demo/startup claims to reflect what was and was not run.

## Current work in progress

### What I'm working on right now


### What's half-done


### What I want Claude Code to do first



