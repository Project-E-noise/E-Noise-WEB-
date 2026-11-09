# Project E-Noise

Noise monitoring for study-hub tables. Each table has an ESP32 sensor node with a
MAX9814 microphone and 11 LEDs. The node sends its sound level every second; the
backend decides the LED state, confirms incidents when a table stays too loud for
10 seconds, tracks violations (3 strikes = one-week ban) and shows everything live
on a web dashboard. Study-hub members can sign in to a client portal to see their
own activity and violations.

| Part | Folder | Tech |
|---|---|---|
| Admin dashboard + client portal | `capstone/` | React 19, Vite, React Router, Chart.js |
| REST API + WebSocket + MQTT ingestion | `server/` | Node 20+, Express, PostgreSQL (`pg`, no ORM), JWT, MQTT.js, ws |
| Sensor node firmware | `firmware/enoise_node/` | ESP32 Arduino, PubSubClient, ArduinoJson |
| Noise classifier (optional add-on) | `ml-service/` | Python, FastAPI, TensorFlow YAMNet |

## Architecture

```
  ESP32 node (per table)                      Browser (admin / client)
  mic -> dB estimate                            React app (Vercel)
  LEDs <- LED command                              |   ^
      |  ^                                 REST    |   |  WebSocket /ws
      |  |  MQTT over TLS (8883)          (JWT)    v   |  (live updates)
      v  |                                  +---------------------+
  +-----------------+   enoise/+/telemetry  |  API  (server/)     |
  |  MQTT broker    |  -------------------> |  Express + ws       |----> PostgreSQL
  |  (HiveMQ Cloud) |  <------------------- |  routes -> controllers|     (Neon)
  +-----------------+   enoise/<node>/led   |  -> services -> models|
                                            +---------------------+
                                               |  WAV clip (only when loud)
                                               v
                                         ml-service (YAMNet, optional)
```

MQTT topics (`server/src/mqtt/topics.js`):

| Topic | Direction | Payload |
|---|---|---|
| `enoise/<node>/telemetry` | device -> API | `{"db_level": 62.4}` (+ optional `classification`, `confidence`, `timestamp`) |
| `enoise/<node>/status` | device -> API, retained, also the Last Will | `{"online": true}` |
| `enoise/<node>/led` | API -> device, retained | `{"green":5,"yellow":3,"red":0,"critical":false}` |
| `enoise/<node>/audio-request` | API -> device | `{"request":"capture"}` |
| `enoise/<node>/audio` | device -> API | 1 s WAV clip (binary), only after a request |

`<node>` is the table's **Sensor node ID** (e.g. `NODE-001`). Adding a table in
Table Configuration is all it takes to register a node.

### Business rules (all enforced on the server)

- **LEDs:** green/yellow/red follow each reading and the table's warning/critical
  thresholds (warning must be lower than critical).
- **Critical confirmation:** the critical bulb and a CONFIRMED incident only happen after
  the level stays at or above the critical threshold for `confirmation_seconds`
  (default 10) without a gap in readings. State is kept in the database, so a
  restart doesn't lose it.
- **Violations and bans:** every CONFIRMED incident linked to an occupant is a violation.
  The 3rd strike bans the occupant for one week and releases them from their table.
  The ban ends by itself at `ban_until`, and strikes start again from 0 (the history
  is kept). An admin can lift a ban early. Incident + violation + ban are saved in
  one transaction.
- **Categories:** exactly four, spelled identically in JS, SQL, firmware and Python:
  `Loud Conversation`, `Mobile Phone Noise`, `Impact Noise`, `Ambient Baseline`.

## Local setup

You need **Node.js 20+**, **PostgreSQL 14+** and **git**. Python 3.11 only if you want
the ML service; the Arduino IDE or `arduino-cli` only for the firmware.

On Windows PowerShell, if `npm` is blocked by the execution policy, use `npm.cmd`.
Use `copy` instead of `cp`.

### 1. Database

```bash
createdb enoise          # or in psql: CREATE DATABASE enoise;
createdb enoise_test     # only needed for npm test
```

### 2. API (`server/`)

```bash
cd server
cp .env.example .env     # then edit .env (see "Environment variables")
npm install
npm run db:migrate       # creates/updates all tables (safe to re-run)
npm run db:seed          # demo data + demo accounts (safe to re-run)
npm run dev              # http://localhost:5000, restarts on file changes
```

Minimum `.env` for local work: `DATABASE_URL`, `JWT_SECRET` (any long random string),
and `ADMIN_SIGNUP_CODE` if you want to try admin registration. Without
`HIVEMQ_HOST` the API runs fine, just without live sensor data. Without
`EMAIL_PROVIDER`, emails are not sent: the verification / password-setup link is
printed in this terminal.

Check: `http://localhost:5000/health` returns `{"status":"ok"}`.

### 3. Web app (`capstone/`)

```bash
cd capstone
cp .env.example .env     # VITE_API_BASE_URL=http://localhost:5000
npm install
npm run dev              # http://127.0.0.1:5173
```

### 4. ML service (optional)

The backend works without it; incidents then get the fallback category
"Loud Conversation". See `ml-service/README.md`.

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8001     # first start downloads YAMNet
```

### 5. Firmware

1. Copy `firmware/enoise_node/secrets.example.h` to `secrets.h` and fill in Wi-Fi,
   broker and `NODE_ID` (must match the table's Sensor node ID). `secrets.h` is gitignored.
2. Install the ESP32 board package and the libraries PubSubClient 2.8 and ArduinoJson 7.
3. Board "ESP32 Dev Module", then upload. Or from the command line:
   `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/enoise_node`
   (then `arduino-cli upload -p COM3 --fqbn esp32:esp32:esp32 firmware/enoise_node`).

Wiring, parts and bench tests: `docs/HARDWARE_GUIDE.md`.

## Demo accounts (created by `npm run db:seed`)

| Role | Email | Password | Sign-in page |
|---|---|---|---|
| Admin | `admin@enoise.local` | `Admin@12345` | `/login` |
| Client (Maria Santos, 2 strikes) | `client@enoise.local` | `Client@12345` | `/client/login` |

These passwords are for local demos only. In production the seed only creates
accounts when you pass `SEED_ADMIN_PASSWORD` / `SEED_CLIENT_PASSWORD` (see Deployment).

The seed also adds 7 tables (`NODE-001` ... `NODE-007`, table 7 is PAUSED), 7 days of
readings, 8 occupants, 17 incidents, one active ban (Juan) and one ended ban (Pedro).
Running it again adds nothing new.

## Environment variables

### `server/.env`

| Variable | Required | Meaning |
|---|---|---|
| `NODE_ENV` | | `development` (default), `production` or `test` |
| `PORT` | | Default 5000 (Render sets it automatically) |
| `DATABASE_URL` | yes | Postgres connection string. Neon: add `?sslmode=require` |
| `JWT_SECRET` | yes in production | 32+ random characters; the server refuses to start in production without it |
| `JWT_EXPIRES_IN` | | Session length, default `7d` |
| `CORS_ORIGIN` | yes in production | Comma-separated allowed website origins. One `*` per entry is allowed, e.g. `https://enoise-*-yourname.vercel.app` for Vercel previews |
| `CLIENT_URL` | yes in production | Website address used inside emails (no trailing slash) |
| `ADMIN_SIGNUP_CODE` | | Invite code required on `/register`. Empty = admin registration disabled |
| `EMAIL_PROVIDER` | | `brevo`, `smtp`, or empty (print links to the console) |
| `EMAIL_FROM` | | Sender, e.g. `E-Noise <you@example.com>` (must be a verified sender in Brevo) |
| `BREVO_API_KEY` | with brevo | Brevo API key |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | with smtp | SMTP server (local development only; Render free blocks SMTP) |
| `HIVEMQ_HOST`, `HIVEMQ_PORT`, `HIVEMQ_USERNAME`, `HIVEMQ_PASSWORD` | | MQTT broker. Empty host = MQTT off |
| `MQTT_PROTOCOL` | | `mqtts` (TLS, default) or `mqtt` (local test broker) |
| `ML_SERVICE_URL` | | ML service address, default `http://localhost:8001` |
| `ML_API_KEY` | | Shared secret sent as `X-API-Key` to the ML service |
| `TEST_DATABASE_URL` | for tests | Separate database whose name contains `test` (it is wiped) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_CLIENT_EMAIL`, `SEED_CLIENT_PASSWORD` | | Accounts created by the seed |

### `capstone/.env`

| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | API address, e.g. `http://localhost:5000` or `https://enoise-api.onrender.com`. Public; never put secrets here. |

### `ml-service`

`ML_API_KEY` (same value as the backend), `TFHUB_CACHE_DIR` (optional model cache folder).

## Tests

```bash
cd server
# .env must contain TEST_DATABASE_URL=postgresql://user:password@localhost:5432/enoise_test
npm test
```

56 tests (`node:test` + `supertest`) run against a real Postgres database. The
test database is wiped and migrated first. They cover every endpoint (success and
main error cases), admin/client role checks and data scoping, the
incident -> violation -> ban transaction (including rollback and concurrent
incidents), ban expiry and strike reset, threshold validation, the 10-second
confirmation engine, exports (incl. CSV formula escaping), analytics, and
WebSocket authentication.

The frontend has no unit tests; it was checked with a Playwright click-through
of every admin and client page at 375 px, 768 px and 1280 px (see `HANDOFF.md`).

## Simulator (no hardware needed)

Publishes messages exactly like a real node, through the same broker the API uses
(needs the `HIVEMQ_*` values in `server/.env`, and the API running):

```bash
cd server
npm run simulate                                         # NODE-001, normal levels
npm run simulate -- --node NODE-002 --spike              # climbs into critical and holds it
npm run simulate -- --node NODE-002 --spike --seconds 40 # stops by itself
```

With `--spike`, watch Live Overview: after ~10 s above critical the table shows the
critical bulb, a CONFIRMED incident appears in Incident Logs, and the table's
occupant gets a violation (Maria is on table 2 in the demo data with 2 strikes, so
this bans her). Stop with Ctrl+C or `--seconds`.

## Security notes

- Passwords (admins and clients) are hashed with bcrypt; never returned by the API.
- Every admin route requires a verified admin token and rejects client tokens (403).
  Client routes only accept client tokens and always use the id inside the token,
  so a client can only see their own data.
- All SQL is parameterized and lives in `server/src/models/`.
- Every endpoint validates its input (`server/src/utils/validate.js`) and returns
  `{ "error": "message" }` with a proper status code. Stack traces are never sent.
- `helmet` security headers; rate limits on login, registration, email and password endpoints.
- CORS only allows the origins in `CORS_ORIGIN`.
- CSV exports neutralise cells starting with `=`, `+`, `-` or `@` (spreadsheet
  formula injection); email HTML is escaped; React escapes everything shown on screen
  (no `dangerouslySetInnerHTML`).
- **Why there is no CSRF token:** the app does not use cookies. The login token is
  kept in `localStorage` and sent in the `Authorization: Bearer` header, which a
  browser never adds automatically to requests from other websites. Classic CSRF
  relies on cookies being sent automatically, so it doesn't apply. If you ever switch
  to cookie sessions, add CSRF protection (SameSite cookies plus a CSRF token).
  The trade-off of `localStorage` is that an XSS bug could read the token, which is
  why the app avoids injecting HTML.
- The WebSocket gets the token as `?token=` because browsers can't set headers on
  WebSocket connections. Request logs replace any `token=` value with `[hidden]`,
  and the WebSocket upgrade isn't logged by the API.
- The firmware connects with TLS but skips certificate checking (`setInsecure()`);
  load the broker's CA certificate for a real deployment.

## Deployment (free tiers)

Limits below were checked on 2026-11-10 and change often; re-check before relying
on them.

| Part | Host | Free-tier limits that matter |
|---|---|---|
| Frontend | Vercel Hobby | ~100 GB transfer/month; personal, non-commercial use only |
| API | Render free web service | Sleeps after 15 min without requests (~1 min to wake); 750 instance-hours/month per workspace (enough for one always-on service); outbound SMTP ports blocked |
| Database | Neon free | 100 CU-hours/month per project, compute sleeps after 5 min idle; 0.5-1 GB storage (Neon's docs and other sources disagree, check your dashboard) |
| MQTT | HiveMQ Cloud Serverless | 100 connections, 10 GB/month. **Retired on 2026-12-31** (see below) |
| Email | Brevo free | 300 emails/day, HTTP API, sender must be verified, Brevo footer in emails |
| ML (optional) | Your laptop + Cloudflare quick tunnel | Free, only while your laptop runs it |

### 1. Database: Neon

1. Create a Neon project (region near your users, e.g. Singapore).
2. Copy the connection string (it ends with `?sslmode=require`). The API turns on
   SSL automatically for it.
3. Create the tables and seed from your computer:
   ```bash
   cd server
   # PowerShell: $env:DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
   DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" npm run db:migrate
   DATABASE_URL="..." NODE_ENV=production SEED_ADMIN_PASSWORD="<strong password>" SEED_CLIENT_PASSWORD="<strong password>" npm run db:seed
   ```
   Skip the seed if you don't want demo data in production (then create the first
   admin through `/register` with `ADMIN_SIGNUP_CODE`).

Don't use Render's free Postgres (it expires) or Supabase (not allowed for this project).

### 2. MQTT broker: HiveMQ Cloud

1. In HiveMQ Cloud, open your cluster, and under Access Management create credentials
   for the backend (and preferably separate ones for the devices).
2. Note the cluster host (`xxxx.s1.eu.hivemq.cloud`) and TLS port 8883.

> **HiveMQ Cloud Serverless shuts down on 2026-12-31.** After that date clients can't
> connect and clusters are deleted, and new Serverless clusters can't be created.
> Before then, move to another broker. Nothing in the code is HiveMQ-specific, so
> moving only means changing values:
> - `HIVEMQ_HOST`, `HIVEMQ_PORT`, `HIVEMQ_USERNAME`, `HIVEMQ_PASSWORD` on Render (and in `server/.env`), and
> - `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD` in each node's `secrets.h`, then re-flash.
>
> Options: HiveMQ Cloud **Starter** (paid, about $0.34/hour plus messages, 15-day trial),
> or another hosted broker with TLS on 8883, e.g. **EMQX Serverless** (free quota
> 1 GB traffic + 1M session-minutes per month: enough for a few nodes during opening
> hours, not 7 nodes sending every second 24/7). Run `npm run simulate` against the
> new broker before re-flashing the nodes.

### 3. Email: Brevo

1. Create a free Brevo account and add + verify a sender email (Senders, Domains & Dedicated IPs).
2. Create an API key (Settings -> SMTP & API -> API keys).
3. Use `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY=<key>`, `EMAIL_FROM="E-Noise <verified@sender>"`.

### 4. API: Render

1. Push this repo to GitHub.
2. Render -> **New -> Blueprint** -> pick the repo. `render.yaml` creates the free
   web service `enoise-api` (root `server/`, `npm ci --omit=dev`, `npm start`,
   health check `/health`) and generates `JWT_SECRET`.
3. Fill in the values it asks for:
   `DATABASE_URL` (Neon), `CORS_ORIGIN` (your Vercel URL(s)), `CLIENT_URL` (main Vercel URL),
   `ADMIN_SIGNUP_CODE`, `EMAIL_FROM`, `BREVO_API_KEY`, the `HIVEMQ_*` values, and
   `ML_SERVICE_URL` / `ML_API_KEY` (leave empty if you don't run the ML service).
4. After deploy, open `https://<service>.onrender.com/health`.

**Keeping it awake.** A sleeping free service drops its MQTT connection, so live
readings stop until someone opens the site (wake-up takes about a minute; the
web app shows a "server is starting" message and a retry button). Readings sent
while it sleeps are lost. During opening hours, keep it awake with a free monitor:

- [UptimeRobot](https://uptimerobot.com) (HTTP monitor, 5-minute interval) or
  [cron-job.org](https://cron-job.org) (every 10 minutes) calling `https://<service>.onrender.com/health`.
- `/health` doesn't touch the database, so Neon can still sleep.
- One service awake all month uses ~744 of the 750 free hours. Don't run a second
  free service in the same Render workspace around the clock.

### 5. Frontend: Vercel

1. Vercel -> **Add New Project** -> import the repo, **Root Directory `capstone`**
   (framework Vite, build `npm run build`, output `dist`; `capstone/vercel.json`
   already sends every path to `index.html`, so deep links and email links work).
2. Environment variable: `VITE_API_BASE_URL=https://<service>.onrender.com`. Redeploy after changing it.
3. Add the Vercel URL to `CORS_ORIGIN` and `CLIENT_URL` on Render. Preview deployments
   have their own URLs: add a pattern such as `https://enoise-*-<your-vercel-name>.vercel.app`
   to `CORS_ORIGIN` if you want previews to reach the API.

### 6. ML service (optional, free path)

Hosting TensorFlow needs ~2 GB of RAM. Free app hosts don't offer that, and
Hugging Face now needs a paid PRO plan ($9/month) to create Docker Spaces, so the
free option is to run it on your own computer while you need it:

```bash
cd ml-service
set ML_API_KEY=<long random string>     # PowerShell: $env:ML_API_KEY="..."
uvicorn app:app --port 8001
cloudflared tunnel --url http://localhost:8001   # free "quick tunnel", no account
```

`cloudflared` prints a `https://<random>.trycloudflare.com` address. Put it in
`ML_SERVICE_URL` on Render, and the same key in `ML_API_KEY`. The address changes
every time you start the tunnel. When the laptop is off, the API simply skips
classification.

If you do pay for Hugging Face PRO: create a Docker Space, push the contents of
`ml-service/` (it has a `Dockerfile` and Spaces settings in its README), add the
secret `ML_API_KEY`, and use `https://<user>-<space>.hf.space` as `ML_SERVICE_URL`.

### 7. Devices

Put the broker host/credentials and each table's `NODE_ID` in `secrets.h`, flash
each ESP32, and check the table shows "Online" in Live Overview.

## Known limitations

- **dB values are not calibrated.** The firmware turns microphone voltage into an
  estimated dB value using an assumed reference point. Calibrate against a sound level
  meter before treating readings as real dB(A) (`docs/HARDWARE_GUIDE.md`).
- **The classifier is not validated.** YAMNet's general sound classes are mapped to
  the four categories by keywords; it has not been tested on labeled study-hub audio.
  `ml-service/finetune_stub.py` is the planned starting point once such data exists.
- Logout is stateless: a copied token works until it expires (`JWT_EXPIRES_IN`).
- Rate-limit counters are kept in memory, so they reset when the API restarts or sleeps.
- On Render free, sensor data is lost while the API sleeps (see Keeping it awake).
- PAUSED / OFFLINE table status is informational; readings from such a table still
  create incidents.
- Client portal date filters use whole UTC days; admin pages use the viewer's local time.
- HiveMQ Cloud Serverless is retired on 2026-12-31 (see Deployment step 2).
- The firmware skips TLS certificate checks (`setInsecure()`).
