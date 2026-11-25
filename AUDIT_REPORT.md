# Project E-Noise: pre-deployment audit (Phase 1)

Date: 2026-11-24. Branch: `violation-gating`, plus the uncommitted work
(`telemetryService.js`, migration 017, `firmware/led_test/`). Nothing in the app,
firmware or migrations was changed for this audit. The only new files are this
report and `tools/simulator/`.

Everything below was **run**, not assumed, unless it says "(from reading the
code)". Commands ran against a throwaway local Postgres 18 (`.pgdata`, port
5433) and a local MQTT broker. **Neon and HiveMQ were never contacted.** Note:
`server/.env` on this PC points `DATABASE_URL` at a Neon host and holds HiveMQ
credentials. Every local run therefore passed its own settings, or started the
API from a folder with no `.env`.

## Summary

| Severity | Count |
|---|---|
| Blocker (deploy fails, is insecure, or the core feature breaks) | 3 |
| Should fix | 16 |
| Nice to have | 13 |

End-to-end simulation (firmware-accurate virtual nodes -> local broker -> API ->
DB -> WebSocket): **21 of 22 scenarios pass**, on Node 24 and on Node 22. The
one failure is finding S8 (default thresholds below Studify's quiet level). The
violation gating, duration threshold, UNVERIFIED fallback, daily strike cap,
ban, offline detection, bad-input handling, restart recovery and 30-day
retention all behave as specified.

---

## Findings

### Blockers

**B1. Migration 017 breaks 52 of the 131 server tests, and puts fixed tables into production.**
`server/db/migrations/017_sensor_node_id_alignment.sql:5-24`. The migration
*inserts* tables 1-7 into every database. The tests create their own tables
numbered 1, 2, 3..., so 52 tests fail on `tables_table_number_key`. On a scratch
copy without 017, all tests pass (130/131; the 1 failure only happens in the
copy, because the category-sync test reads `../capstone` and `../ml-service`).
On a fresh Neon database, 017 also creates 7 tables with thresholds 50/60 and
48/58 and **table 7 PAUSED**. Every loud event on table 7 would then be IGNORED.
*Fix:* if 017 has **not** been run on Neon yet, change it to only `UPDATE` the
`sensor_node_id` of tables that already exist (no INSERT), and create the real
tables in Table Configuration. If it already ran on Neon, keep it and add a 018
that is safe for tests, or make the test helper empty `tables` after
migrating. **I need to know whether 017 has been run against Neon.**

**B2. Email is required, not optional. Without Brevo, the first admin can never sign in.**
`render.yaml:39-40` hard-codes `EMAIL_PROVIDER=brevo`. Without `BREVO_API_KEY`,
`emailService.js:40` throws. `authService.js:40-45` and `clientService.js:22-28`
catch the error, but the verification link is neither sent nor printed. The
admin who registers through `/register` stays unverified and gets 403 at login.
Occupants can't finish signing up either. This was verified locally: production
mode with `EMAIL_PROVIDER=brevo` and no key logs `Setup email failed:
EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set` and still answers 201. The
first admin (business rule) and occupant self-registration (business rule)
both depend on Brevo.
*Fix:* list Brevo as **required** in the deploy checklist. In production, refuse
to start (or log a loud warning at start-up) when `EMAIL_PROVIDER=brevo` and
`BREVO_API_KEY` is empty.
*Workarounds and their cost:* `npm run db:seed` with `SEED_ADMIN_PASSWORD` does
create a verified admin, but it also inserts the 8 demo occupants and 7 days of
fake history (`seed.js:149, 282`). That is not acceptable in the study database.
Setting `EMAIL_PROVIDER` to empty on Render prints the link in Render's logs,
which works for the first admin. The cost is a 24-hour, single-use token in the
log, and occupants still need real email.

**B3. API and database would sit on opposite sides of the Pacific.**
`render.yaml:5-13` has no `region:`, so Render uses its default, Oregon (US
West). The Neon database in your `server/.env` is in AWS `ap-southeast-1`
(Singapore). Each reading costs about 6-8 database round trips, one after the
other (from reading the code: `telemetryService.js:38-65`, then
`tablesService.serializeTable`). At a typical 150-180 ms between Oregon and
Singapore, that is about 1-1.4 s of work per reading. Each node sends one
reading per second. The per-node queue (`mqttClient.js:22-31`) has no limit, so
it would fall further and further behind, and the confirmation timer would
measure stretched durations (see S7).
*Fix:* add `region: singapore` to `render.yaml` (Render has a Singapore region).
The region can't be changed after the service is created, so this must be done
before step 1 of the deploy.


### Should fix

**S1. Production starts with localhost defaults for the website address.**
`server/src/config/env.js:101-115`. If `CORS_ORIGIN` or `CLIENT_URL` is
missing, the API falls back to `http://localhost:5173`. The real website is
then blocked by CORS, and email links point to localhost. *Fix:* add both to
the production required list next to `JWT_SECRET` and `DATABASE_URL`
(`env.js:11`).

**S2. The website silently uses localhost if `VITE_API_BASE_URL` is missing on Vercel.**
`capstone/src/services/apiClient.js:6`. *Fix:* fail the production build when
the variable is missing (a check in `vite.config.js`), so a wrong deploy shows
up as a failed build, not a blank dashboard.

**S3. `/health` does not check the database.**
`server/src/app.js:50`. This is deliberate and right for the uptime pinger: a
pinger and Render's health checks that touch the DB would keep Neon awake 24/7
and use up the free compute hours. *Fix:* keep `/health` as it is and add a
separate `GET /health/db` (runs `SELECT 1` with a 3 s timeout and answers only
`{status:"ok"|"error"}`) for the smoke test and manual checks. Neither leaks
internals today: `/health` returns only `{"status":"ok"}`.

**S4. No database connection timeout.**
`server/src/config/db.js:15-20`. If Neon can't be reached, a request waits for
the operating system's TCP timeout. The app already survives a Neon cold start:
nothing at start-up depends on the first query, and the sweep and cleanup timers
log a warning and try again. *Fix:* `connectionTimeoutMillis: 10000` (Neon
usually wakes in 1-5 s).

**S5. No start-up log line when a feature is off in production.**
`env.js:99`. With `ML_SERVICE_URL` empty, nothing is logged, yet every loud
event becomes UNVERIFIED. MQTT already logs `HIVEMQ_HOST is not set - skipping`
(verified). *Fix:* log one line each for "ML off -> every loud event is
UNVERIFIED" and "email off" (see B2).

**S6. Node version not pinned.**
`server/package.json:4-6` says `>=20.0.0`. `render.yaml:16` uses 22, this PC runs
24.15, and `capstone/package.json` has no `engines`. *Fix:* `"node": "22.x"` in
both `package.json` files, plus `.nvmrc` = `22`. Run the tests on 22 (also see B4).

**S7. The confirmation timer uses the time a message is *processed*, not when it *arrived*.**
`telemetryService.js:48` (`new Date()`). When processing lags (slow database,
Neon waking up, B3), loud streaks look longer than they were. *Fix:* take the
time when the MQTT message arrives (`mqttClient.js:74`) and pass it as `now`.
`ingestTelemetry` already accepts it; it is about 3 lines.

**S8. Default thresholds are below Studify's quiet level.**
The defaults are in migration 017 (`:19-20`, 50/60 and 48/58), `tablesService.js:151`
(new tables 50/60) and `seed.js:47-50`. With a quiet room at about 60 dB
(uncalibrated), a quiet table sits at or above "critical". The red LEDs are on
all the time, and every ~2 minutes a loud streak is logged as IGNORED or
UNVERIFIED. The simulator shows this (scenario S1b below). With 68/75 the same
quiet room stays green (S1). *Fix:* calibrate first, then set the thresholds.
The Phase 2 calibration proposal includes starting values.

**S9. The dashboard says "CRITICAL" for any loud sound, including a door slam.**
`tablesService.js:87` (`computeStatus`), `capstone/src/components/tables/TableCard.jsx:15,30`.
The real critical indicator works: the 11th LED and the red "VIOLATION" badge
only light for a confirmed violation (verified in S5a-S5e). But the noise-level
badge next to it reads "CRITICAL" in red whenever a reading crosses the
threshold. A panel member could fairly call that a critical indicator for a
false violation. *Fix (wording only, your call):* rename the level labels to
QUIET / ELEVATED / LOUD, and keep "critical" for the confirmed-violation bulb.

**S10. Identifying the offender depends on admins keeping seat assignments up to date.**
`incidentsService.js:96-105`. The person blamed is whoever was *assigned* to the
table in the dashboard when the streak started. A violation at a table with no
assigned occupant is still CONFIRMED, but nobody gets a strike. This is not a
code bug; it is an operating rule. *Fix:* write it into the deployment procedure
and the paper ("assign occupants on check-in, release on check-out").

**S11. Microphone front-end: AGC, no A-weighting, and an ADC ceiling.**
`firmware/enoise_node/enoise_node.ino:27-30, 306-331`. The MAX9814's automatic
gain control compresses loud sounds, so the mV-to-dB relation changes with
level and over time (HARDWARE_GUIDE.md:345 says so too). There is no weighting
filter, so low-frequency highway rumble counts fully and pushes the quiet
baseline up. With the current (placeholder) calibration table, the ADC clips at
about 92 dB: the simulator's port of the maths reads a 99 dB sound as 96 dB.
*Fix (Phase 2, calibration):* a first-order digital high-pass filter at about
150-200 Hz costs a few multiplications per sample at 4 kHz, so it fits easily on
the ESP32. True A-weighting needs a higher sample rate and more work. An
INMP441 I2S microphone has no AGC and would be more consistent.

**S12. No lint or format configuration, but 16 directives for one.**
There are 15 `// eslint-disable-next-line no-console` lines (e.g. `env.js:17`,
`mqttClient.js:41`) and one `react-hooks/exhaustive-deps` (`capstone/src/hooks/useAsync.js:39`),
yet the repo has no ESLint or Prettier config. Some `console.warn` lines have
the directive and others don't. *Fix:* add a minimal `eslint.config.js`
(recommended + react-hooks) and `.prettierrc`, run them once, and keep only the
directives the config needs.

**S13. Rate limiting behind Render's proxy needs a check after deploy.**
`app.js:13` trusts exactly 1 proxy. If Render puts more than one proxy in front
of the app, every visitor gets the same IP, and the login limit (10 per 15 min)
then applies to everybody at once. *Fix:* in Phase 4, check `RateLimit` headers
from two different networks. If they share a counter, adjust `trust proxy`.

**S14. Two simulators that disagree.**
`server/scripts/simulate-device.js` sends `classification` and `timestamp`,
which the firmware never sends, and it needs HiveMQ. Its header says it is
"exactly like a real node", which is not true. *Fix:* remove it (and the
`simulate` npm script), or make it a thin wrapper around
`tools/simulator/virtual-node.js`, which matches the firmware.

**S15. Intermittent native crash of the API on Node 24.15 (Windows).**
On this PC's Node 24.15.0 the simulator ran 5 times (3 full runs, 2 partial).
In 2 of them, the first two full runs, the API process ended with exit code
`0xC0000409` (a Windows "fast fail" abort inside Node itself), with no
JavaScript error and nothing in the log. Both times it was between the first
and second scenario. The 3 later runs had no crash (the last two had crash
reports switched on), and neither did the full run on **Node 22.21.1**
(Render's version). The app uses no native npm modules.
This points to the Node 24 runtime on Windows, not to the app, but it is not
proven. *Fix:* pin Node 22 (S6) for development as well as for Render. If it
ever shows up on 22, run with `--report-on-fatalerror` (the simulator already
does) and look at the report.

**S16. The real ML service doesn't start on this laptop as it is.**
The cached YAMNet model in `%TEMP%\tfhub_modules\9616fd04...` is incomplete:
it has `assets/` and `variables/` but no `saved_model.pb`, probably an
interrupted download. `uvicorn app:app` fails with "contains neither
'saved_model.pb' nor 'saved_model.pbtxt'". This laptop is the planned ML
host. *Fix:* delete that one cache folder (or set `TFHUB_CACHE_DIR` to a new
folder) so YAMNet downloads again. With a fresh cache it starts and works (see
section 6). I did not delete anything outside the repo.

### Nice to have

**N1. Dead code.** `sensorStatusModel.findAll` (`sensorStatusModel.js:33`),
`occupantsModel.liftExpiredBans` (`occupantsModel.js:109`; bans end through
`EFFECTIVE_STATUS` instead), `DEFAULT_CONFIRMATION_SECONDS` (`data/constants.js:20`),
`CATEGORY_COLORS` (`capstone/src/components/analytics/Charts.jsx:11`), and the
`publicAdmin` re-export (`authService.js:15`). knip found no unused files and
depcheck no unused packages.

**N2. Duplicated constants.** `BCRYPT_ROUNDS`, `DUMMY_HASH` and the 24 h token
lifetime are in both `authService.js:9-13` and `clientService.js:11-13` (two
bcrypt hashes at every start-up). Move them to one small module.

**N3. `runnerFor(client)` is copied into 4 models** (incidents, occupants,
tableAssignments, violations). Export it once from `config/db.js`.

**N4. Stale or wrong comments.**
- 10 "Phase N" / "the spec" references (`topics.js:1,11,12,61,127,136,139`,
  `wsServer.js:4`, `mqttClient.js:116`, `ledLogic.js:6`). A panel member reading
  them will be asked "what is Phase 7?".
- `clientService.js:46` says occupants are "added by an admin", but admins
  can't add occupants any more.
- `topics.js:58` calls `db_level` "dB(A) SPL", but there is no A-weighting
  (see S11). Say "estimated dB".
- `HANDOFF.md:53` says `SENSOR_STALE_SECONDS` defaults to 60; the code uses 15.
- Missing "why": the green LED rule in `ledLogic.js:19`
  (`round(db / warning * 5)`, never fewer than 1). In practice it shows 4-5
  green whatever the quiet level. Explain it, or change it during calibration.

**N5. Long or complex functions a team must be able to explain.**
`capstone/src/hooks/useRealtime.js:24` is 116 lines; split it into
connect / poll / reconnect helpers. `runConfirmationEngine` (`telemetryService.js:86`,
complexity 25) is the core rule. Split it into `handleReadingGap`,
`handleDecidedStreak` and `handleOpenStreak` so each branch can be explained
on its own. `serializeTable` and `readIncidentFields` also have complexity 25.
No file is over 300 lines except `styles.css` (501) and one test file (348).

**N6. The warn-once set grows without limit** (`telemetryService.js:28`, the
uncommitted change): every new unknown node ID stays in memory. Cap it (e.g. 100
entries). Only a broker client with credentials can send these, so the risk is
low.

**N7. The WebSocket accepts any Origin** (`wsServer.js:29`). A valid admin token
is still required, so this is defence in depth: reject origins that aren't in
`CORS_ORIGIN`.

**N8. Email/setup tokens are stored in plain text** (`clientsModel.js:53`,
`adminsModel`). Store a SHA-256 of the token instead. The links already expire
after 24 h and work only once.

**N9. Firmware:** no firmware version in the payload (`enoise_node.ino:338-344`);
`PRINT_RMS_MV` is always on, and there is no explicit calibration mode. Both are
covered by the Phase 2 calibration work.

**N10. Neon:** use the *direct* (non-pooled) connection string for
migrations and the pooled one for the app. Both work today: the app uses no
session features that the pooler would break.

**N11. `render.yaml` doesn't list `VIOLATION_RETENTION_DAYS` (30) or
`NOISE_READINGS_RETENTION_DAYS` (7).** The defaults apply. List them so the
30-day rule is visible in the deploy config.

**N12. `capstone/index.html:12-13` loads Google Fonts and Tabler icons from CDNs.**
These are third-party requests from every visitor. Mention them in the privacy
notice, or self-host the files.

**N13. Housekeeping.** `e-noise-client-portal-changes.zip` is an old snapshot
(2026-11-06, 35 source files); no secrets were found in it. Don't commit it; add
`*.zip` to `.gitignore`. Commit `firmware/led_test/`: it is useful for bench tests.

---

## 1. Does it work?

| Check | Result |
|---|---|
| `server/` `npm ci` | OK, 175 packages, 0 vulnerabilities. No build step (plain Node). |
| `capstone/` `npm ci` + `npm run build` | OK, 0 vulnerabilities, **no warnings**, main chunk 270.7 kB (86 kB gzip), Charts 191 kB lazy-loaded. |
| Lint | **No lint or format config in the repo** (S12). One-off runs found no errors, only the long or complex functions in N5. |
| Server tests (`npm test`, 131 tests) | **79 pass / 52 fail with migration 017**, all `tables_table_number_key` (B1). Without 017: all pass. |
| ML service tests (16) | 16/16 pass (`.venv`, Python 3.11.15). |
| Migrations 001-017 on an empty DB | All 17 applied; second run: "Already up to date". 017 creates NODE-001..007 (T7 PAUSED). |
| Migrations on a copy of your local data (at 013) | 014-017 applied cleanly; second run no-op. Existing tables (incl. T8/NODE-008) kept, `sensor_status` rows kept. |
| Re-run safety | `migrate.js` records each file in `schema_migrations` and runs each migration in its own transaction. Safe to re-run. 017 on its own is also idempotent (`ON CONFLICT`). Edge case (from reading the code): if two existing tables have each other's node IDs, 017's UPDATE hits the unique index and the migration rolls back. |
| Local smoke (API) | 13/13 checks: `/health`, first admin via `/register` + invite code (wrong code 403), login blocked until email verified, verify, login, `GET /api/tables`, no admin route creates occupants (404), occupant self-signup + password + login, client token on an admin route 403, no token 401, CORS allowed and denied origin. |
| Production-mode start | Refuses to start without `JWT_SECRET`/`DATABASE_URL`, with a short JWT secret, or with an ML URL but no key. With `HIVEMQ_*`, `ML_SERVICE_URL` and `BREVO_API_KEY` empty, it starts, logs `HIVEMQ_HOST is not set - skipping`, serves requests, and runs the retention jobs. Helmet headers present (CSP, HSTS, nosniff, frame-options). |
| Firmware | Both sketches compile for `esp32:esp32:esp32` (core 3.3.12) with `--warnings all`: no warnings. `enoise_node` uses 78% of flash. |

## 2. Production readiness

| Item | Status | Where |
|---|---|---|
| `PORT` from env, all interfaces | OK: `server.listen(env.port)` binds `::` (all interfaces) | `server.js:16`, `env.js:110` |
| `trust proxy` | OK in production (1 hop; verify, S13) | `app.js:13` |
| No hard-coded localhost | Only fallbacks: server `env.js:99,101,115` (S1), client `apiClient.js:6` (S2) | |
| Client derives WebSocket URL from `VITE_API_BASE_URL` | OK: `http` -> `ws`, `https` -> `wss` | `apiClient.js:118-122` |
| SPA rewrite on Vercel | OK: `capstone/vercel.json` rewrites every path to `/index.html` | |
| Neon: SSL, small pool, cold start | SSL on with `sslmode=require` or in production off-localhost, certificate verified (`dbConfig.js`); pool max 10; no connection timeout (S4) | `db.js` |
| `/health` | Doesn't touch the DB (on purpose, S3), leaks nothing | `app.js:50` |
| Runs without HiveMQ / ML / Brevo | Yes, but email is effectively required (B2) | |
| `engines.node` | Not pinned (S6) | |
| `render.yaml` | Build `npm ci --omit=dev`, start `npm start`, health `/health`, Node 22, `JWT_SECRET` generated. Missing `region` (B3). The env list matches the code; the code also reads `VIOLATION_RETENTION_DAYS`, `NOISE_READINGS_RETENTION_DAYS` (N11) and `SMTP_*` (local only). Nothing in `render.yaml` is unused. | |
| `.env.example` | Both exist with placeholders only; `server/.env.example` lists every variable the code reads. | |
| 30-day auto-delete | **OK as is.** It runs at every start (and every Render wake-up is a start) and every 24 h while awake (`server.js:47-60`). More importantly, strikes are counted with the 30-day window *in SQL* (`violationsModel.js:25-33`), so a cleanup that runs late can never cause a wrong ban. The simulator's S12 confirms the deletion. No change needed. | |

## 3. Security

| Item | Status |
|---|---|
| Password hashing | bcrypt, cost 10, both admins and clients; dummy hash for unknown emails (timing); never returned by the API; no password or token in logs (`morgan` hides `token=`). |
| JWT | Secret from env (start-up refuses <32 chars in production), HS256 pinned, expiry 1 d admin / 7 d client, admin tokens revoked on logout (`token_version`). |
| Route protection | Every admin router uses `requireAuth` (admin role checked server-side, client tokens get 403); client routes use `requireClient` and the id from the token. Verified: client token on an admin route returns 403, no token returns 401. |
| Admin creating occupants | None. There is no `POST /api/occupants` (verified: 404). Admins can edit name/contact, delete, seat/release, and lift bans; they can't change an occupant's email. |
| SQL | All parameterized. Template strings only insert fixed column lists or `$n` placeholders, never user input (checked every `${` in `models/`). |
| CORS | Locked to `CORS_ORIGIN` (one `*` per entry for Vercel previews); requests without an Origin header are allowed (curl, pinger). Verified: allowed origin echoed, other origin gets no header. |
| Rate limits + headers | Login 10/15 min, register 10/h, email 5/h, password 10/15 min (in memory); helmet on. |
| Input validation | `utils/validate.js` on every body and query; JSON body limit 100 kB; node IDs restricted to letters, digits, `-` and `_` (`tablesService.js:122`). |
| WebSocket auth | Same admin check as REST before the socket is accepted; close code 4001 on a bad token; 4 kB message limit. |
| MQTT ingest | JSON parsed in try/catch; `db_level` must be a number 0-200; classification only from the 5 known categories; unknown node IDs are dropped (warned once); audio accepted only within 10 s of the server's own request, and must look like a WAV. Verified in S10. |
| Secrets in git | **Nothing leaked.** No `.env` or `secrets.h` was ever committed; history scan for connection strings, Neon/HiveMQ hosts, Brevo keys, JWT/invite/ML keys, Wi-Fi/MQTT passwords and private keys found only placeholders. The untracked zip holds no secrets. `server/.env` and `firmware/enoise_node/secrets.h` exist locally and are ignored. Nothing to rotate. |

### What "encryption" we actually have (for the panel)

Say exactly this, and no more:

- **In transit, browser <-> website and API:** HTTPS/TLS. Vercel and Render provide
  the certificates; the API also sends HSTS. The live WebSocket uses `wss://`.
- **In transit, API <-> database:** TLS to Neon, with the certificate verified
  (`rejectUnauthorized: true`).
- **In transit, sensor node <-> broker <-> API:** MQTT over TLS on port 8883. The
  ESP32 checks the broker's certificate against a pinned root CA (`setCACert`);
  the API's MQTT client verifies it too.
- **In transit, API <-> ML service and Brevo:** HTTPS (the Cloudflare tunnel and
  Brevo's API). The ML service also needs a shared API key.
- **Passwords:** *hashed* with bcrypt (one-way, salted, cost 10). Not encrypted:
  nobody, including us, can read them back.
- **Login sessions:** JWTs are *signed* (HS256) so they can't be forged or changed.
  They are not encrypted: their content (user id, role) is readable.
- **Audio:** never stored. A 1-second clip is held in memory only while it is
  classified, then dropped. Only the label is saved.
- **At rest:** we do **not** encrypt anything ourselves. Names, emails,
  incidents and readings are plain columns in Postgres. Any disk-level encryption
  is Neon's infrastructure feature, not ours; check Neon's security page before
  quoting it. Setup and verification tokens are stored in plain text (N8).

Don't claim "end-to-end encryption" or "encrypted database". Do claim "all
network traffic is encrypted with TLS, and passwords are stored as bcrypt hashes".

## 4. Business rules

| Rule | Status | Enforced by |
|---|---|---|
| PostgreSQL on Neon (not Supabase) | **Implemented** | `pg`, no ORM; `dbConfig.js` SSL for Neon; no Supabase code anywhere |
| Occupants register themselves (email + password) | **Implemented** (two steps: name + email + consent, then the emailed link sets the password) | `clientService.register` / `setPassword`, `POST /api/client/register`, `/set-password` |
| Admins cannot create occupant accounts | **Implemented** (verified 404) | no `POST /api/occupants`; `occupantsService.updateOccupant` blocks email changes |
| First admin via `/register` with `ADMIN_SIGNUP_CODE` | **Implemented**, but needs working email to verify (B2) | `authService.register` (`safeEqual` on the code); empty code turns registration off |
| Only violation categories create a violation/strike | **Implemented**: Loud Conversation (talking, shouting, laughing, crowd...), Mobile Phone Noise, Music | `data/constants.js:9`, `violationRules.decideVerdict`, `violationsService.recordViolationIfApplicable` (CONFIRMED only), `category_mapping.py` |
| Other loud sounds: no violation, no strike, no critical indicator | **Implemented** for violation, strike and critical bulb. Short sounds (door slam, chair, cough, dropped object, truck, horn) are stopped by the duration threshold: no record at all. Sustained non-violation sounds are logged as IGNORED incidents for review (not violations) under Incident Logs -> Filtered. The red level LEDs and the level badge reading "CRITICAL" still react to loudness (S9). | `telemetryService.decide` (`bulb_triggered` only for CONFIRMED), `decideVerdict` |
| ML unavailable -> UNVERIFIED, no strike | **Implemented** | `decideVerdict` (`no_classification`), engine doesn't wait when `isMlServiceUp()` is false |
| Duration threshold before an event counts | **Implemented**: `confirmation_seconds` per table (default 10 s; 4 s once a confident phone label arrives), 2 s dip tolerance, >5 s reading gap discards | `telemetryService.runConfirmationEngine`, `violationRules.categoryDurationSeconds` |
| Violations kept 30 days, then auto-deleted | **Implemented** (also unlinks old incidents and deletes old seat history) | `retentionService.cleanupPersonalData`, `server.js:47-60`, window also applied in SQL (`violationsModel.countStrikes`) |
| Backend security ("encryption") | **Implemented** as described above (TLS everywhere, bcrypt); no encryption at rest by us | see section 3 |
| Identify and ban repeat offenders | **Implemented**: strike to the occupant seated when the streak started; 3 strikes within 30 days = 1-week ban + seat released; max 1 strike per 24 h; admins can lift bans; removing a strike recounts. **Depends on seat assignments** (S10) | `violationsService.js`, `incidentsService.createIncident` (`activeAt`) |
| 11 LEDs per table (5 green / 3 yellow / 2 red / 1 critical) | **Implemented** | firmware pins `enoise_node.ino:79-82`, `ledLogic.computeLedCounts`, `LedArray.jsx`, `topics.buildLedPayload` |
| One sensor node per table, 2nd floor of Studify | **Implemented** (one unique `sensor_node_id` per table). The 2nd-floor descriptions exist only in `seed.js`; 017 leaves descriptions empty | `tables.sensor_node_id` unique, `tablesService.assertNoDuplicate` |

## 5. Clean, organized, explainable?

- **Structure:** routes -> controllers -> services -> models is applied
  consistently, and all SQL lives in `models/`. One small exception:
  `utils/verifyAdminToken.js` calls a model, so it belongs in `services/` or
  `middleware/`.
- **Style:** ESM everywhere (no `require`), async/await everywhere (4 small
  `.then` chains that are fine), one error shape `{ error }`, and consistent
  response keys (`{ table }`, `{ tables }`, `{ incident }`...).
- **Dead code / duplicates / comments / long functions:** see N1-N5. Overall the
  comments explain *why* well (thresholds, strike cap, retention, ML fallback
  all have reasons). The cleanup is small.
- **Over-engineering:** nothing serious. The 5-way incident status set (with
  legacy `MONITORING`) and `neighbor_louder`, a filter reason that is never
  produced, are the two things a panel member might ask about. Both are
  documented as reserved or legacy.
- **Lint/format:** none configured (S12).

## 6. Firmware and the virtual device

### What the firmware does (`firmware/enoise_node/enoise_node.ino`)

| Question | Answer |
|---|---|
| Board | ESP32 Dev Module (ESP32-WROOM-32 / DevKitV1), Arduino core 3.3.12 |
| Microphone | MAX9814 electret module with **AGC**, analog output to GPIO34 (ADC1, works with Wi-Fi on); gain pin floating (60 dB) |
| dB value | `loop()` takes one `analogReadMilliVolts()` sample every 250 us (4 kHz target). Each 1-second window: mean (the mic's DC bias) subtracted, RMS = sqrt(mean of squares - mean^2), converted to dB with `CAL_TABLE` (4 **placeholder** rows, linear in 20*log10(mV)), clamped to 30-100 dB. Windows with fewer than 2000 samples are skipped. **No A-weighting or any filter, no single offset**: the whole calibration is the table. |
| Publish interval | 1 s (`TELEMETRY_INTERVAL_MS`). One reading is skipped after each audio capture, so there is a ~2 s gap. |
| Topics | `enoise/<NODE_ID>/telemetry`, `/status` (retained, Last Will `{"online":false}`), `/led` (subscribed), `/audio-request` (subscribed), `/audio` (1 s 16 kHz WAV, 32 KB) |
| Payload | exactly `{"db_level":52.3}` (one decimal, QoS 0, not retained). No timestamp, classification or firmware version. |
| Node ID | `NODE_ID` from `secrets.h` (e.g. `NODE-001`); matches migration 017's `NODE-001`...`NODE-007` |
| LED level | **Decided by the server** (`ledLogic.computeLedCounts`): below warning, green = round(dB / warning x 5), at least 1; between warning and critical, 1-3 yellow by thirds (green stays 5); at or above critical, 5 + 3 + 2 red. The critical bulb comes only from the confirmation engine. The node only applies the retained `/led` command, blinks the bulb locally (400 ms), and switches everything off after 30 s without a command. |
| Duration threshold | **Server only** (`confirmation_seconds`, default 10 s) |
| Payload vs. server | **Matches.** `parseTelemetry` needs `db_level` as a number in 0-200, ignores missing optional fields, and the topic shape and node ID format agree. No blocker. |
| Compile | OK, no warnings (see section 1) |
| Wokwi | No `wokwi.toml` / `diagram.json` in the repo, so this was skipped |

### The virtual device (`tools/simulator/`)

- `firmware-model.js`: ports `rmsToDb()`, the RMS window over simulated ADC
  samples, the payload format, LED handling and the WAV header.
- `virtual-node.js`: same topics, QoS, retained status and Last Will as the
  firmware; skips a reading after each audio capture like the firmware; applies
  the LED commands. Options: `--node --count --scenario --broker --seconds`.
- `broker.js`: aedes (Mosquitto isn't installed). `mock-ml.js`: YAMNet stand-in,
  using real YAMNet class names and categories from `category_mapping.py`.
- `run-scenarios.js`: starts everything against a throwaway database, creates the
  first admin and the occupants through the real API, then checks API, DB and
  WebSocket. `README.md` has the Windows commands.
- **Real ML service:** there is **no sample audio in the repo**, so it was only
  checked with synthetic clips. Once started with a fresh model cache (S16):
  `/health` reports `model_loaded: true`; `/classify` without a key gives 401;
  a non-WAV body gives 400; a 1 kHz tone gives Ambient Baseline ("Beep,
  bleep", 0.88), white noise gives Ambient Baseline ("White noise", 0.35) and
  silence gives Ambient Baseline ("Silence", 1.0). The answer shape is what
  `mlClient.js` expects. Real talking, music and door slams were **not**
  classified; that needs recordings from Studify.

### Scenario results

`node tools/simulator/run-scenarios.js`, 2026-11-24, with a throwaway database,
the local broker and the mock ML service. Tables 1-5 used the proposed Studify
thresholds (warning 68 / critical 75 dB, 10 s). Test-only shortcut: 3 s cooldown
instead of 120 s. Each row was checked through the API, the database rows and
the WebSocket messages, and the LED commands the virtual node received.
Full output: `tools/simulator/results/`.

| # | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| S0 | API smoke | health, first admin via invite, occupant self-signup, role checks, CORS | 13/13 checks OK | PASS |
| S1 | Quiet baseline (~60 dB traffic), thresholds 68/75 | Green LED levels, no events | no incident; LEDs never above green, critical off; 30 readings stored; 31 WS `table:update`; readings 58.5-65.8 dB | PASS |
| S1b | Same baseline with 017's default thresholds (48/58) | Green, no events | **IGNORED incident** (Ambient Baseline); LEDs up to 3 yellow + 2 red in a quiet room; no strike | **FAIL: finding S8** |
| S2 | Short spike (4 s talking at ~85 dB) | No event, no strike | no incident; strikes 0 -> 0; red LEDs lit (level), critical off | PASS |
| S3 | Sustained loud talking (~85 dB, 18 s) | Violation, strike, live dashboard update | CONFIRMED / Loud Conversation (Speech), bulb on after 10 s, peak 86.3; strikes 0 -> 1; WS `incident:created` x1; node's critical LED on | PASS |
| S4a | Sustained shouting (~92 dB) | Violation + strike; critical indicator at max level | CONFIRMED / Loud Conversation (Shout); strike; node: 5G 3Y 2R + critical | PASS |
| S4b | Music (~88 dB, 18 s) | Violation + strike; critical indicator | CONFIRMED / Music; strike; critical on | PASS |
| S4c | Phone ringing (~80 dB, 8 s) | Violation + strike (4 s phone rule) | CONFIRMED / Mobile Phone Noise (Ringtone) after 4 s; strike; critical on | PASS |
| S5a | Door slam, chair, cough, dropped object (1-2 s each) | Not a violation, no strike, no critical indicator | no incident; no strike; red LEDs blink with the level, critical off | PASS |
| S5b | Truck passing (~7 s, peak ~80 dB) | No event (duration threshold) | no incident; critical off | PASS |
| S5c | Car horn (2 s, ~88 dB) | No event | no incident; critical off | PASS |
| S5d | Sustained hammering (~82 dB, 15 s) | Review only, no strike, no critical | IGNORED / Impact Noise (Hammer), `non_violation_category`; no strike; critical off | PASS |
| S5e | Sustained traffic/horns (~79 dB, 15 s) | Street noise: no strike, no critical | IGNORED / Ambient Baseline (Traffic noise); no strike; critical off | PASS |
| S5f | Talking the classifier is unsure about (0.31) | UNVERIFIED, no strike | UNVERIFIED / `low_confidence`; critical off | PASS |
| S6 | ML service down + sustained talking | UNVERIFIED, no strike | UNVERIFIED / `no_classification`; no strike; critical off; `/api/system/status` says ml_service=offline | PASS |
| S7a | Repeat offender, 2nd loud talking the same day | Logged; no 2nd strike in 24 h (daily cap) | CONFIRMED; strikes stay 1 | PASS |
| S7b | Repeat offender: 2 strikes on earlier days + 3rd today | Ban flow as designed | BANNED for 7.0 days, seat released, client portal shows BANNED | PASS |
| S8 | 5 nodes at once | Each table separate, no mix-ups | T1 quiet: none; T2 talking: CONFIRMED [Speech] to the right occupant; T3 false sounds: none; T4 music: CONFIRMED [Music]; T5 traffic: IGNORED [Traffic noise]. Readings stored = readings sent on every table (30/22/27/23/21) | PASS |
| S9 | Node offline then back | Offline/online shown, no crash | power cut (Last Will): offline after 0.5 s, WS update sent, back online; frozen node: offline after ~15 s (sweep), back online | PASS |
| S10 | Malformed payloads, unknown node, unrequested audio | Rejected, logged, server keeps running | 5/5 bad telemetry logged; NODE-999 logged and ignored; bad status, non-WAV and unrequested WAV dropped; 0 rows stored; API alive | PASS |
| S11 | API killed mid-stream, restarted | Recovers and reconnects | re-subscribed to the broker, 8 readings in 8 s after restart, dashboard WebSocket reconnected. Readings sent while it was down are lost | PASS |
| S12 | Records older than 30 days | Removed by retention | 31-day violation deleted, 29-day kept; 31-day incident unlinked from the occupant; 8-day raw reading and 31-day released seat deleted | PASS |

**21 of 22 pass. The single failure, S1b, is a real finding (S8), not a code
bug.** The same 21/22 came out with the API on Node 22.21.1. See S15 for the
intermittent Node 24 crash seen in 2 earlier runs.

How to repeat any of this: `tools/simulator/README.md`.

## Risks (stated, not fixed)

- **Render free sleeps after 15 min without *incoming HTTP* requests.** MQTT
  traffic is an outgoing connection, so sensors publishing do **not** keep it
  awake. While it sleeps, readings are lost: no persistent MQTT session, QoS 0
  from the nodes (simulator S11 shows readings sent while the API is down are
  gone). A pinger every 10 min (cron-job.org) or 5 min (UptimeRobot) should keep
  it up, and one service awake all month fits in the 750 free hours. Render
  free instances still restart on deploys and occasionally on their own, and
  each restart loses a few seconds. **For the 14-day study, Render's cheapest
  paid always-on instance is the safer choice** (check the current price on
  Render's pricing page). The pinger is acceptable only if you report "data
  gaps during restarts" as a limitation.
- **Neon free compute hours.** Readings arrive every second, so the database
  never goes to sleep while nodes are on. At the minimum 0.25 CU, 24 h for 30
  days is about 180 CU-hours, against 100 free per month. The 14 days alone are
  about 84 CU-hours, which is close to the limit once development use is
  included. When the limit is hit, Neon suspends the database until the next
  month. Either power the nodes only during opening hours, or move to a paid
  Neon plan for the study month.
- **HiveMQ Cloud Serverless shuts down on 2026-12-31.** If the 14-day deployment
  or any demo crosses that date, move to HiveMQ Starter (paid, about $0.34/h) or
  EMQX Serverless (free: 1 GB + 1M session-minutes per month; 7 nodes at 1 msg/s
  plus LED replies is about 2-3 GB/month, so it is enough only during opening
  hours). Changing broker touches **no code**: only `HIVEMQ_HOST/PORT/USERNAME/PASSWORD`
  on Render, and `MQTT_HOST/PORT/USERNAME/PASSWORD` plus **`MQTT_CA_CERT`** in each
  node's `secrets.h`, followed by a re-flash (the CA certificate changes too if
  the new broker uses a different CA). Test with `tools/simulator` first.
- **The ML service runs on a laptop through a Cloudflare quick tunnel.** When the
  laptop is off or asleep, every loud event becomes UNVERIFIED (no strikes,
  verified in S6). The tunnel address also changes at every start, so
  `ML_SERVICE_URL` on Render must be updated each time. For the defense demo,
  run it on a laptop you control and check the "ML service offline" badge first.
- **Vercel Hobby is for non-commercial use only.** That is fine for a capstone;
  just don't use it for Studify's own business afterwards.
