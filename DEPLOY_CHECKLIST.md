# Deploy checklist

**Never paste a connection string, password or API key into chat, a commit or
a file in the repo.** They go only into the Neon/Render/Vercel/Brevo dashboards
and your PowerShell window.

Current production (2026-11-25): Render (Singapore) and Vercel
(https://e-noise-web.vercel.app) run the **old `main`**. `enoise-prod` was
migrated with the **old 017** (data only). Login and Brevo email work.

---

## A. Done by Claude Code (branch `deploy-prep`, verified locally)

| Area | Change |
|---|---|
| Database | Migration 017 rewritten as schema-only (node-ID format CHECK); the 7 tables moved to `npm run db:seed:tables`. **New migration 018** (additive): calibration offset/gain per table, raw reading + firmware version per sensor, `peak_db` + `samples` on readings. |
| Accounts | `npm run admin:create`: creates/verifies an admin without email (section C). |
| Config | Production refuses to start without `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGIN`, `CLIENT_URL`. The dashboard build fails without `VITE_API_BASE_URL`. Node 22 pinned. `render.yaml`: region Singapore. |
| Rules | New tables default to 68/75 dB. LED bands: green from a 50 dB floor, 2nd red at critical + 5. Level badge reads QUIET/ELEVATED/LOUD. Loud streaks timed by arrival time. |
| Calibration | Per-node offset/gain in Table Configuration. Firmware 1.1.0: calibration mode (`cal`), version in each reading, 150 Hz high-pass filter. `tools/calibration/compute-offset.js`. |
| Database load | One reading row per table per 10 s (violations still judged per reading). No queries while no node is on. Readings cleanup daily. |
| Other | `/health/db`, 10 s DB connection timeout, start-up log lines for ML/email, ESLint, ML model-cache self-repair, dead code removed, docs (`CODE_WALKTHROUGH.md`, `docs/CALIBRATION.md`, `docs/DB_LOAD_PROPOSAL.md`). |

**Verified:**
- Server tests: 152/152 on Node 22.21.1 and on Node 24.15.
- ML tests: 20/20. Calibration tool tests: 4/4.
- ESLint clean (server and dashboard); dashboard build OK.
- Migrations 001→018 from empty.
- Simulator: 23/23 end-to-end scenarios with the API on Node 22.
- Firmware 1.1.0 compiles (normal and calibration build), no warnings.
- **Not tested on real hardware.**

## B. Studify opening hours: when the nodes are on

Power the 7 nodes **only during opening hours** (Asia/Manila time). The hours
cross midnight:

| Day | Nodes ON | Nodes OFF |
|---|---|---|
| Monday – Saturday | 10:00 | 01:00 the next day |
| Sunday | 15:00 | 01:00 (Monday) |

That is 100 hours per week. With the nodes off, the API makes no database
queries, so Neon sleeps; the 14-day study then uses ≈ 52 of the 100 free
compute hours and ≈ 46 MB of storage (docs/DB_LOAD_PROPOSAL.md). A smart plug
or timer on the nodes' power strip makes this automatic.

Keep the cron-job.org ping (`/health`, every 10 min) running **24/7**. It
doesn't touch the database, and it keeps Render awake so the API is already
connected to the broker when the nodes switch on at 10:00 / 15:00.

## C. Fallback: create an admin without email (`npm run admin:create`)

Use this if email isn't working, or an admin registered but never got the
verification email. Run it in **PowerShell** (Git Bash may show the password
while you type).

1. `cd "C:\Users\User\Downloads\Project E-Noise\server"`
2. `$env:DATABASE_URL = "<Neon connection string>"`
3. `npm run admin:create`
4. Check the host and database it shows, then type `y`.
5. Enter the name, email and password (twice). The password isn't shown or
   printed.
6. `Remove-Item Env:DATABASE_URL`

A new email gets a verified admin. An existing admin is verified, gets the new
password, and its old sessions are signed out. A DISABLED admin stays disabled.

## D. Bring a database that ran the OLD 017 in line (enoise-prod and enoise-dev)

`npm run db:migrate` will **not** run the new 017 on these databases, because
`schema_migrations` already has a row for that file name. Add its constraint
by hand. Run this **before** merging: it is compatible with the old code,
which already applies the same rule.

In Neon → the project (`enoise-prod`, then `enoise-dev`) → **SQL Editor**:

1. Safety check: must return **no rows**.
   ```sql
   SELECT id, table_number, sensor_node_id FROM tables
   WHERE sensor_node_id !~ '^[A-Za-z0-9_-]{1,100}$';
   ```
   If it returns rows, rename those node IDs in Table Configuration first.
2. Add the constraint:
   ```sql
   ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_sensor_node_id_format;
   ALTER TABLE tables ADD CONSTRAINT tables_sensor_node_id_format
     CHECK (sensor_node_id ~ '^[A-Za-z0-9_-]{1,100}$');
   ```
3. Check: returns one row.
   ```sql
   SELECT conname FROM pg_constraint WHERE conname = 'tables_sensor_node_id_format';
   ```

The tables the old 017 inserted stay; they are your real 7 tables.

## E. Updating production after `deploy-prep` is ready

**Before the merge:**

1. Render → `enoise-api` → **Environment**: check that `CORS_ORIGIN` and
   `CLIENT_URL` are both set to `https://e-noise-web.vercel.app`. The new code
   refuses to start without them.
2. Neon → `enoise-prod` → SQL Editor: run section D, steps 1–3.
3. Neon → `enoise-prod` → **Connect** → **Connection pooling off** → copy the string.
4. PowerShell: `cd "C:\Users\User\Downloads\Project E-Noise"`
5. `git checkout deploy-prep`
6. `cd server`
7. `$env:DATABASE_URL = "<the enoise-prod string>"`
8. `npm run db:migrate`. Expect `Applying 018_calibration_firmware_reading_windows.sql...`
   and `Applied 1 migration(s).` (018 only adds columns; the running old code
   keeps working.)
9. `Remove-Item Env:DATABASE_URL`
10. Optional: repeat steps 2–9 for `enoise-dev`.

**Merge:**

11. Tell Claude Code to push `deploy-prep` and open the pull request.
12. On GitHub, review and **merge** the pull request into `main`.

**After the merge:**

13. Render → `enoise-api` → **Events**: a new deploy starts by itself
    (`autoDeploy`). If not: **Manual Deploy → Deploy latest commit**.
14. If Render shows a **Blueprint sync** for `render.yaml`, approve it. It only
    adds `DEFAULT_*_THRESHOLD` and `LED_*` with the same values as the built-in
    defaults.
15. Render → **Logs**: look for `listening on port` and
    `[email] Sending email with brevo.`
16. Open `https://<render-url>/health` and `/health/db`: both answer
    `{"status":"ok"}`.
17. Vercel → project → **Deployments**: the new production deployment from
    `main` is **Ready**.
18. Open https://e-noise-web.vercel.app and sign in.
19. Neon → `enoise-prod` → SQL Editor: move the existing tables to the
    provisional thresholds (the old 017 gave them 50/60 and 48/58):
    ```sql
    UPDATE tables SET warning_threshold = 68, critical_threshold = 75, updated_at = NOW()
    WHERE table_number BETWEEN 1 AND 7;
    ```
20. Dashboard → **Table Configuration**: each table shows *Calibration offset* 0
    and *gain* 1.

**Devices:**

21. Switch each MAX9814's AGC off (TH to MICBIAS, or another microphone):
    docs/CALIBRATION.md section 2.
22. Flash firmware 1.1.0 to every node (each with its own `secrets.h`).
23. On each table page, check `Firmware 1.1.0`.
24. Calibrate every node (docs/CALIBRATION.md) and enter its offset/gain in
    Table Configuration.
25. Set the nodes' power to the opening hours (section B).

**If something goes wrong:** Render → **Deploys** → the previous deploy →
**Rollback**. Migration 018 only added columns, so the old code runs fine on
the migrated database.

## F. Migrations after 017

| File | What it does | Run on |
|---|---|---|
| `018_calibration_firmware_reading_windows.sql` | Adds `tables.calibration_offset_db` (0), `tables.calibration_gain` (1) with a range check; `sensor_status.raw_db`, `sensor_status.firmware_version`; `noise_readings.peak_db`, `noise_readings.samples` (1) | `enoise-prod` and `enoise-dev`, with `npm run db:migrate` (section E steps 3–9) |

**Every time a new migration is merged:** run `npm run db:migrate` against Neon
again. Render's build does not run migrations.

## G. Reference: first-time setup (already done for this deployment)

1. **Neon:** project in AWS Asia Pacific (Singapore). `npm run db:migrate`
   (string with pooling off), then optionally `npm run db:seed:tables`. Never
   `npm run db:seed` (demo data).
2. **Brevo:** verify the sender; create an API key.
3. **Render:** New → Blueprint → repo. Fill in:

| Variable | Where to get it | Required? | Example format |
|---|---|---|---|
| `DATABASE_URL` | Neon → Connect, **pooling on** | Required | `postgresql://neondb_owner:****@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `CORS_ORIGIN` | The Vercel URL | Required | `https://e-noise-web.vercel.app` |
| `CLIENT_URL` | The Vercel URL, no trailing slash | Required | `https://e-noise-web.vercel.app` |
| `ADMIN_SIGNUP_CODE` | Make one up (20+ random characters) | Required for `/register` | |
| `EMAIL_FROM` | The verified Brevo sender | Required | `E-Noise <you@yourdomain.com>` |
| `BREVO_API_KEY` | Brevo → SMTP & API → API keys | Required | `xkeysib-...` |
| `HIVEMQ_HOST`, `HIVEMQ_USERNAME`, `HIVEMQ_PASSWORD` | HiveMQ cluster + backend credential | For sensors | `xxxx.s1.eu.hivemq.cloud` |
| `ML_SERVICE_URL` | The `cloudflared` address | Optional | `https://abc-def.trycloudflare.com` |
| `ML_API_KEY` | Make one up; same on the ML service | Required if `ML_SERVICE_URL` is set | 32+ random characters |
| `JWT_SECRET` | Generated by Render | Automatic | |

4. **Vercel:** import the repo, Root Directory `capstone`, set `VITE_API_BASE_URL`
   to the Render URL.
5. Put the Vercel URL into `CORS_ORIGIN` and `CLIENT_URL` on Render; redeploy.
6. First admin: `/register` with `ADMIN_SIGNUP_CODE`, or section C.
7. cron-job.org: `https://<render-url>/health` every 10 minutes, 24/7.

## H. Known limitations

Filled in after the post-deploy checks (Phase 4).
