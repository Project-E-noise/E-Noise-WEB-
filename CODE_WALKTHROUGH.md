# Code walkthrough (for the defense)

One section per feature: the files involved, in the order a request or reading
passes through them, then how it works in plain words. Server paths are under
`server/src/` unless they say otherwise; dashboard paths are under
`capstone/src/`.

The server is layered the same way everywhere: **routes** (URL → function) →
**controllers** (read the request, send the response) → **services** (the
rules) → **models** (the only place with SQL). Input checks are in
`utils/validate.js`, and errors are always `{ "error": "message" }`
(`middleware/errorHandler.js`).

---

## 1. Login and accounts (auth)

**Files:** `pages/Login.jsx`, `Register.jsx`, `VerifyEmail.jsx`, `ClientRegister.jsx`,
`ClientSetPassword.jsx`, `ClientLogin.jsx` → `context/AuthContext.jsx` →
`services/apiClient.js` → `routes/authRoutes.js`, `routes/clientRoutes.js` →
`controllers/authController.js`, `clientController.js` → `services/authService.js`,
`clientService.js` → `models/adminsModel.js`, `clientsModel.js`. Shared helpers:
`utils/passwords.js` (bcrypt), `utils/tokens.js` (JWT), `utils/verifyAdminToken.js`,
`middleware/auth.js`, `middleware/rateLimits.js`. Fallback: `server/scripts/create-admin.js`.

- **Admins** register at `/register`. That only works with the invite code
  `ADMIN_SIGNUP_CODE` (compared in constant time). After registering, they
  must click the emailed link before they can sign in.
- **Occupants** create their own accounts. They give name, email and consent
  at `/client/register`, get an email link, and set their password on that
  page. Admins cannot create occupants (there is no such endpoint).
- Passwords are stored only as **bcrypt hashes** (cost 10). A login with an
  unknown email still runs a bcrypt check, so you can't tell from the timing
  which emails exist.
- A successful login returns a **signed JWT** (HS256, 1 day for admins, 7 days
  for occupants). The browser keeps it in localStorage and sends it as
  `Authorization: Bearer ...`.
- `requireAuth` lets only verified, enabled **admins** through (client tokens get
  403). `requireClient` lets only clients through, and always uses the id
  inside the token, so an occupant can only see their own data. Admin logout
  increases `token_version`, which cancels every older admin token.
- If email delivery fails, `npm run admin:create` creates (or verifies) an
  admin directly in the database (DEPLOY_CHECKLIST.md).

## 2. Sensor readings over MQTT

**Files:** `firmware/enoise_node/enoise_node.ino` → MQTT broker → `mqtt/mqttClient.js`
→ `mqtt/topics.js` (`parseTelemetry`) → `services/telemetryService.js` (`ingestTelemetry`)
→ `models/tablesModel.js`, `sensorStatusModel.js`, `noiseReadingsModel.js`.

- Each ESP32 samples its microphone about 4,000 times a second, passes every
  sample through a 150 Hz high-pass filter (against highway rumble), and every
  second publishes the RMS level as an estimated dB value with its firmware
  version: `{"db_level":61.3,"fw":"1.1.0"}` on `enoise/<NODE_ID>/telemetry`.
- The API subscribes to `enoise/+/telemetry` (and `/status`, `/audio`).
  `parseTelemetry` rejects anything that isn't JSON with a number from 0 to 200.
- The node ID in the topic must match a table's **Sensor node ID**. Unknown IDs
  are ignored, with one warning per ID. The database itself only accepts IDs
  made of letters, digits, `-` and `_` (migration 017), because they become
  topic names.
- Messages from the same node are handled **one at a time, in order**
  (`runInOrder`), so the rules below never run twice at once for one table.
  Each message is stamped with the time it **arrived**, so the loud-streak timer
  stays right even if the database is slow.
- **Calibration:** `applyCalibration` turns the node's raw value into
  `gain × raw + offset`, using that table's calibration from Table Configuration
  (default ×1, +0 dB). Everything after this uses the corrected value.
- `sensor_status` keeps the latest value (and the raw one, and the firmware
  version) and marks the node online. Every reading goes through the rules
  below on its own, but **storage** is grouped: `services/readingWindows.js`
  writes one `noise_readings` row per table per 10 s (average, peak, number of
  readings).
- **Online/offline:** a node publishes a retained `{"online":true}` and leaves
  `{"online":false}` as its MQTT *Last Will*, so the broker reports a power cut.
  If a node just goes silent, `sweepStaleSensors` (every 15 s, `server.js`)
  marks it offline after `SENSOR_STALE_SECONDS` (15 s). Once every node has been
  silent that long and been marked offline, the sweep stops querying the
  database (`sweepNeeded`), so Neon can sleep while the nodes are off.

## 3. Noise thresholds, LEDs and the duration rule

**Files:** `utils/ledLogic.js`, `services/telemetryService.js` (`runConfirmationEngine`),
`utils/violationRules.js` (`categoryDurationSeconds`), `services/thresholdsService.js`,
`config/thresholdDefaults.js`, `components/thresholds/ThresholdCard.jsx`,
`pages/Thresholds.jsx`.

- Each table has a **warning** and a **critical** threshold. New tables get
  68 / 75 dB from `DEFAULT_WARNING_THRESHOLD` / `DEFAULT_CRITICAL_THRESHOLD`
  (provisional until calibration); admins change them on the Thresholds page.
- `computeLedCounts` turns each reading into the 11-LED pattern: green 1–5 in
  steps from a quiet floor (50 dB) up to warning, yellow 1–3 between warning and
  critical, 1 red at critical and 2 red at critical + 5 dB (provisional band
  edges, `LED_GREEN_FLOOR_DB` / `LED_RED_STEP_DB`). The API sends that pattern
  back to the node on `enoise/<node>/led`. **The node never decides its own
  LEDs.**
- A reading at or above critical starts a **loud streak**. Dips of up to 2 s
  don't end it; a silence of more than 5 s throws it away.
- The streak is only judged after it lasted **`confirmation_seconds`** (10 s by
  default; 4 s once a confident phone ring was heard). That is the panel's
  duration rule: door slams, coughs, horns and passing trucks are over long
  before that, so they never become events.
- The streak's state lives in the `sensor_status` row, so an API restart
  doesn't lose it.

## 4. Sound classification (ML verification)

**Files:** `services/telemetryService.js` (`maybeRequestAudio`, `ingestAudioClip`) →
`mqtt/mqttClient.js` (`requestAudioClip`) → firmware `captureAndPublishAudio` →
`services/mlClient.js` (`classifyAudioClip`) → `ml-service/app.py` →
`ml-service/category_mapping.py` → `models/sensorStatusModel.js` (`appendStreakLabel`) →
`utils/violationRules.js` (`decideVerdict`).

- When a loud streak starts (and every 5 s while it lasts), the API asks that
  node for a 1-second audio clip. The node records it at 16 kHz and sends it as
  a WAV file on `enoise/<node>/audio`.
- A clip is only accepted within 10 s of the API's own request. It is
  forwarded to the ML service with the shared `X-API-Key`, and **never
  stored**; only the resulting label is kept.
- The ML service runs Google's **YAMNet** model (521 sound classes) and maps
  the classes to our five categories with an explicit list: Loud Conversation
  (speech, shouting, laughter), Mobile Phone Noise, Music, Impact Noise,
  Ambient Baseline.
- `decideVerdict` looks at every label from the streak. No label or only
  unsure labels (below `MIN_CONFIDENCE` 0.5) → **UNVERIFIED**. A strict majority
  of violation categories → **CONFIRMED**. Anything else (door, cough, traffic,
  typing) → **IGNORED**.
- If the ML service is down (the API pings it every 30 s), the API doesn't wait
  for a label: the event is UNVERIFIED, so **no strike**. The dashboard shows an
  "ML service offline" badge.

## 5. Violations and strikes

**Files:** `services/telemetryService.js` (`decide`) → `services/incidentsService.js`
(`createIncident`, `updateIncident`) → `services/violationsService.js`
(`recordViolationIfApplicable`) → `models/incidentsModel.js`, `violationsModel.js`,
`tableAssignmentsModel.js` (`activeAt`); `data/constants.js`
(`VIOLATION_CATEGORIES`); dashboard `pages/IncidentLogs.jsx`,
`components/incidents/ConfirmViolationModal.jsx`.

- Every judged streak becomes an **incident**: CONFIRMED, IGNORED or UNVERIFIED,
  with its peak dB, duration, YAMNet's top class and the reason it was
  filtered. IGNORED/UNVERIFIED appear under Incident Logs → Filtered for review.
- Only a **CONFIRMED** incident decided while the noise is still going lights
  the **critical bulb** (the 11th LED) and the "VIOLATION" badge. The level
  badge only says QUIET / ELEVATED / LOUD.
- The person blamed is whoever was **assigned to that table when the streak
  started**. No assigned occupant means no strike. Admins must seat people.
- A CONFIRMED incident creates one **violation (strike)**, at most
  `MAX_STRIKES_PER_DAY` (1) per occupant in any 24 h, so one long noisy
  afternoon can't cause a ban.
- The incident, the violation and a possible ban are saved in **one database
  transaction**, with the occupant row locked, so two incidents at the same
  moment can't both miss the 3rd strike.
- An admin can confirm a filtered incident by hand ("Confirm as violation"); it
  then goes through the same strike rules. Undoing a confirmation removes its
  strike.

## 6. Bans

**Files:** `services/violationsService.js` (`recordViolationIfApplicable`,
`removeViolationForIncident`) → `models/occupantsModel.js` (`ban`, `liftBan`,
`liftBanAfterRecount`, `EFFECTIVE_STATUS`) → `models/tableAssignmentsModel.js`
(`releaseForOccupant`); `services/occupantsService.js`; dashboard
`pages/Occupants.jsx`, client `pages/ClientDashboard.jsx`.

- Strikes are counted in SQL: violations since the occupant's last ban and
  inside the last 30 days (`countStrikes`).
- The **3rd strike** bans the occupant for **7 days**, releases them from their
  table, and restarts their strike count at 0.
- A ban ends by itself. Every read computes the status with `EFFECTIVE_STATUS`
  (BANNED only while `ban_until` is in the future), so no background job is
  needed.
- A banned occupant can't be seated. Admins can lift a ban early. If an admin
  removes one of the strikes behind a ban, the ban's strikes are recounted, and
  below 3 the ban is lifted.
- The occupant sees their strikes and ban in the client portal.

## 7. 30-day retention

**Files:** `server.js` (timers) → `services/retentionService.js` →
`models/violationsModel.js` (`deleteOlderThan`), `incidentsModel.js`
(`unlinkOccupantsOlderThan`), `tableAssignmentsModel.js` (`deleteReleasedOlderThan`),
`noiseReadingsModel.js` (`deleteOlderThanBatch`); settings in `config/env.js`.

- At every start and then every 24 h, the API deletes violations older than
  `VIOLATION_RETENTION_DAYS` (30). It removes the occupant's name from incidents
  that old, and deletes released seat history that old.
- Running bans are stored on the occupant (`ban_until`), so deleting old
  violations never ends a ban early.
- Even if the cleanup runs late (e.g. the API was asleep), strikes are counted
  over the last 30 days in the query itself, so an old violation can never
  cause a ban.
- Reading rows (10 s averages) older than `NOISE_READINGS_RETENTION_DAYS` (7)
  are deleted once a day, in batches, to stay inside Neon's free storage. Daily
  rather than hourly, so a sleeping database isn't woken every hour.

## 8. Live dashboard (WebSocket)

**Files:** `services/telemetryService.js` → `services/tablesService.js` (`serializeTable`)
→ `realtime/wsServer.js` (`broadcastTableUpdate`, `broadcastIncidentCreated`) →
browser `services/apiClient.js` (`getWsUrl`) → `hooks/useRealtime.js` →
`pages/LiveOverview.jsx`, `TableMonitoring.jsx`, `RealTimeFeed.jsx`,
`components/tables/TableCard.jsx`, `LedArray.jsx`.

- The WebSocket is served on the same port as the API, at `/ws`. The browser
  connects to `wss://<api>/ws?token=...`; `https` automatically becomes `wss`.
- Browsers can't send headers on a WebSocket, so the admin token is in the URL.
  It is checked with exactly the same rules as REST (`verifyAdminToken`). A bad
  token closes the socket with code 4001, which signs the dashboard out. Logs
  hide the token.
- After each reading the server pushes `table:update` (that table's full live
  state), and after each decision `incident:created`. Pages merge these into
  what they show.
- `useRealtime` reconnects by itself, falls back to polling while the socket is
  down, and refetches everything on connect and every 60 s, so a missed message
  can't leave the screen wrong for long.

## 9. Email

**Files:** `services/emailService.js` ← `services/authService.js` (admin verify link),
`services/clientService.js` (occupant set-password link); settings in `config/env.js`.

- One function, `sendEmail`, with three modes picked by `EMAIL_PROVIDER`: **brevo**
  (HTTP API; used on Render because Render's free plan blocks SMTP), **smtp**
  (local development), or empty (the link is printed in the API's log instead).
- Links contain a random 64-character token, valid for **24 hours** and usable
  once. The address comes from `CLIENT_URL`.
- Registration answers the same way whether or not the email already exists,
  so the form can't be used to find out who has an account.
- If sending fails, the account still exists. The user can ask for a new email,
  and the first admin can be created with `npm run admin:create`. At start-up
  the API logs one line if email is off or Brevo has no key.

## 10. Start-up, configuration and database

**Files:** `server.js`, `app.js`, `config/env.js`, `config/thresholdDefaults.js`,
`config/db.js`, `config/dbConfig.js`; `server/db/migrate.js`, `migrations/001-018`,
`seed-tables.js`, `seed.js`.

- `env.js` reads every setting once. In production it **refuses to start**
  without `JWT_SECRET` (32+ characters), `DATABASE_URL`, `CORS_ORIGIN` and
  `CLIENT_URL`, or with an ML address but no ML key.
- `app.js` adds the security headers (helmet), CORS limited to `CORS_ORIGIN`,
  the JSON body limit, and logging that hides tokens. `/health` answers without
  touching the database (for the pinger); `/health/db` checks the database.
- The database connection uses SSL with certificate checking for Neon, a pool
  of at most 10 connections, and a 10 s connection timeout.
- `npm run db:migrate` applies each new SQL file once, in order, each in its
  own transaction (`schema_migrations` remembers which ran). Render does
  **not** run it: run it from your PC after every new migration.
- `npm run db:seed:tables` creates the 7 Studify tables. `npm run db:seed` adds
  the demo data, for local demos only.
