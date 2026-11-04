# Project E-Noise — Web Application

Refactored per `capstone_web_specs.docx`. Two independent projects:

- **capstone/** — React + Vite admin dashboard (Phase 1, done)
- **server/** — Node.js + Express REST API, backed by PostgreSQL (Phases 2–4, done)

## Status against the phased plan in the spec

| Phase | Scope | Status |
|---|---|---|
| 1 | Refactor existing React frontend | Done |
| 2 | Node.js + Express backend, REST APIs | Done |
| 3 | PostgreSQL schema, migrations, models | Done — real Postgres via `pg`, no ORM, no Supabase |
| 4 | Admin auth: registration, email verification, login/logout, JWT, protected routes | Done — JWT + bcrypt + email verification, backed by Postgres; real SMTP if configured, console fallback otherwise |
| 5 | MQTT ingestion (ESP32 + MAX9814), real LED state | Done — HiveMQ Cloud via `mqtt`, 10-second critical-confirmation engine, LED commands published back to devices |
| 6 | WebSocket/SSE real-time | Done — WebSocket at `/ws`, JWT-authenticated; `useRealtime.js` uses it with a polling fallback |
| 7 | ML classification wiring | Done — YAMNet microservice (`ml-service/`), audio requested from devices only when a table crosses `warning_threshold` |
| 8 | Testing/fixing | Frontend builds clean; backend smoke-tested end-to-end against a real Postgres database (see below) |

## Quick start

**Database**
```
createdb enoise               # or via psql: CREATE DATABASE enoise;
```

**Backend**
```
cd server
cp .env.example .env          # set DATABASE_URL (required), JWT_SECRET, SMTP_* (optional)
npm install
npm run db:migrate            # creates all tables, including 009_realtime_state.sql
npm run db:seed               # seeds 7 tables + sample readings/incident/violation
npm run dev                   # http://localhost:5000, WebSocket at ws://localhost:5000/ws
```

Set `HIVEMQ_HOST`/`HIVEMQ_USERNAME`/`HIVEMQ_PASSWORD` in `server/.env` to
enable MQTT ingestion (Phase 5). Without them the server still runs fine —
it just logs a warning and skips MQTT, so REST/dashboard work continues
without hardware connected. `npm run simulate` publishes fake-but-realistic
device messages once HiveMQ is configured, for testing without real
hardware — see the Phase 5 section below.

**Frontend** (separate terminal)
```
cd capstone
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:5000
npm install
npm run dev                   # http://localhost:5173
```

**ML service** (separate terminal, optional — backend runs fine without it)
```
cd ml-service
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8001    # first run downloads YAMNet from TF Hub
```
Set `ML_SERVICE_URL` in `server/.env` if it's not on `localhost:8001`. See
the Phase 7 section below and `ml-service/README.md` for details.

Register an administrator account at `/register`. If `SMTP_HOST` isn't set in
`server/.env`, the backend doesn't send real email — the verification link is
printed to the **backend's** console/terminal instead. Copy it into your
browser to verify, then log in. Set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
`SMTP_PASS`/`EMAIL_FROM` to send real verification emails via nodemailer.

## What's genuinely working right now

- **PostgreSQL persistence** for every entity in the spec's data model:
  `admins`, `tables`, `occupants`, `table_assignments`, `noise_readings`,
  `incidents`, `violations`, `sensor_status`. Schema lives in
  `server/db/migrations/*.sql`; `npm run db:migrate` applies them in order
  and tracks what's already run in a `schema_migrations` table, so it's
  safe to re-run.
- Full admin auth flow, now DB-backed: register -> verification email
  (real SMTP or console-logged) -> verify -> JWT login -> protected routes.
  Disabled/unverified admins are rejected server-side even with a valid JWT.
- 7 seeded tables with live-computed status/LED state/classification derived
  from stored readings (placeholder logic — Phase 5 replaces this with real
  MQTT/YAMNet data).
- Incident CRUD, with automatic violation tracking and the 3-violation /
  one-week ban rule enforced server-side, inside a single DB transaction
  per incident (incident + violation + ban update all commit or roll back
  together).
- Occupant CRUD, search, assign/release, violation history.
- Per-table threshold configuration with validation (warning < critical,
  duration >= 0).
- Analytics (incident counts by day/category, noise trends) computed from
  stored readings via SQL aggregation.
- CSV data export (readings, incidents, violations, tables).

Smoke-tested end to end against a real Postgres 16 database: register ->
verify -> login -> protected routes -> table/occupant reads -> incident
creation -> violation tracking through to an automatic ban -> threshold
updates -> CSV export.

## Phase 5 — MQTT ingestion (ESP32 + MAX9814 -> backend)

**Topic schema** (`server/src/mqtt/topics.js`), namespaced by each table's
`sensor_node_id`:

| Topic | Direction | Payload |
|---|---|---|
| `enoise/<node>/telemetry` | device → backend | `{ "db_level": 62.4, "classification"?, "confidence"?, "timestamp"? }` |
| `enoise/<node>/status` | device → backend (retained + Last Will) | `{ "online": true }` |
| `enoise/<node>/led` | backend → device (retained) | `{ "green": 5, "yellow": 2, "red": 0, "critical": false }` |

Only `db_level` is required on telemetry — `classification`/`confidence` are
optional since this firmware doesn't run on-device ML (YAMNet stays
server-side, Phase 7). Backend subscribes with `enoise/+/telemetry` and
`enoise/+/status` wildcards, so adding a table under **Table Configuration**
is all it takes to register a new node — no separate device registry.

**The 10-second critical-confirmation rule** (`server/src/services/telemetryService.js`):
the critical LED and a `CONFIRMED` incident are only created once a table's
`db_level` has stayed at/above `critical_threshold` for
`confirmation_seconds` straight — never on the instant it crosses. That
state (`monitoring_since` / `led_critical` / `active_incident_id`) is
persisted on the `sensor_status` row (migration `009_realtime_state.sql`),
not just in memory, so a mid-streak server restart doesn't lose it. Green/
yellow/red counts are still computed instantly per reading
(`server/src/utils/ledLogic.js`) — only the single critical bulb is gated
behind confirmation, matching the spec's "critical LED rule".

**No hardware yet?** `npm run simulate` (from `server/`) publishes messages
shaped exactly like a real node — `npm run simulate -- --node NODE-002
--spike` walks the dB level up into a confirmed critical event so you can
watch an incident, a violation, and the LED state all get created live.

**ESP32 firmware**: `firmware/enoise_node/enoise_node.ino` — publishes
telemetry, drives the 10-LED array from backend-pushed LED commands, sets
an MQTT Last Will so the dashboard learns about power/WiFi loss instantly.
Wiring and pin map are documented at the top of the file. The dB(A)
conversion is a starting point, not calibrated — check the comments before
trusting absolute numbers against real thresholds.

## Phase 6 — Real-time (WebSocket)

`server/src/realtime/wsServer.js` mounts a WebSocket server at `/ws` on the
same HTTP server/port as the REST API (no extra port to open). Connections
authenticate with the same admin JWT as REST (`?token=...` query param,
since browsers can't set custom headers on a WS upgrade), verified by the
same `verifyAdminToken` the REST middleware uses. The backend pushes
`table:update` and `incident:created` events whenever MQTT ingestion
changes something.

`capstone/src/hooks/useRealtime.js` keeps its original call signature
(`{ fetcher, onData, interval, enabled }`) — internally it now opens the WS
connection and re-runs `fetcher` whenever a push event arrives (debounced),
falling back to the original interval-polling behavior whenever the socket
is down, with automatic reconnect. Currently wired into **Real-Time Feed**;
**Live Overview** could subscribe the same way if you want that page to
update live too, since none of this required a different fetcher shape.

## Phase 7 — ML classification (YAMNet)

Real audio never crosses MQTT continuously — only a scalar `db_level`
does, every second (Phase 5). Phase 7 adds an audio-triggered side path
for classification, on top of that:

1. `telemetryService.js`'s `maybeRequestAudio()` asks a device for one clip
   (`enoise/<node>/audio-request`) only once that table's `db_level`
   crosses `warning_threshold` — never at baseline — throttled to at most
   one request per 5 seconds while the streak continues.
2. The firmware (`firmware/enoise_node/enoise_node.ino`) captures ~1 second
   of 16kHz PCM, wraps it in a WAV header, and publishes it on
   `enoise/<node>/audio`. The buffer is built, sent, and freed — nothing is
   ever written to flash, matching the spec's "no raw audio storage" rule.
3. `mqttClient.js` hands the raw WAV bytes to `telemetryService.ingestAudioClip()`,
   which forwards them to the Python service (`ml-service/`, `POST /classify`)
   and stores only the returned `{category, confidence}` — the audio itself
   is never written to disk or the database on the backend side either.
4. That stored `sensorStatus.classification` is what `runConfirmationEngine()`
   (Phase 5) already reads when a streak reaches `confirmation_seconds`, so
   confirmed incidents get a real classification with no extra wiring.

**`ml-service/`** is a small FastAPI service wrapping pretrained YAMNet
(TensorFlow Hub), with a hand-authored keyword mapping from its 521
AudioSet classes down to this project's 4 categories — see
`ml-service/README.md` for setup, the mapping approach, and the intended
fine-tuning path once you've collected labeled study-hub audio (there's no
labeled dataset behind this yet, so treat it as a reasonable prototype
signal, not a validated classifier). If this service isn't running, the
backend logs a warning and keeps working without classification — it's an
enhancement layer, not a hard dependency of Phases 5/6.

One real bug worth knowing about if you extend this: the classifier picks
a category by the **highest individual class score** within each bucket,
not by summing all classes in a bucket. Summing looked reasonable at
first but silently favored "Ambient Baseline" almost every time, since it
catches ~500 of YAMNet's 521 classes and a pile of small scores across
that many classes outweighs two or three strongly-matching classes in a
smaller bucket like "Loud Conversation". Caught this with a synthetic-score
test in `ml-service/` before it ever touched real audio.

## Database layer, if you want to look under the hood

- `server/db/migrations/*.sql` — one file per table, applied in filename
  order. Uses `CHECK` constraints for enum-like fields (e.g. incident
  `status`, table `status`) instead of a separate `enum` type, and a
  partial unique index to enforce "one active assignment per table/occupant"
  without an extra boolean column.
- `server/db/migrate.js` / `server/db/seed.js` — small, dependency-free
  scripts (no ORM/migration framework), matching the spec's "don't
  over-engineer" instruction.
- `server/src/config/db.js` — the `pg` connection pool, plus a
  `withTransaction` helper used anywhere more than one write needs to be
  atomic.
- `server/src/models/*.js` — one file per table; every function is a
  parameterized SQL query. This is the only layer that touches `pg`
  directly — services never write raw SQL.
- `server/src/services/*.js` — unchanged business rules from Phase 2,
  now reading/writing through the models instead of an in-memory store.
