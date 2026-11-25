# Database load for the 14-day study

Status: **P1 and P2 are built** (branch `deploy-prep`). P3 is documented but not
built.

## 1. Measurements

`tools/simulator/measure-db-load.js`: the real API, 7 virtual nodes sending one
reading per second, a throwaway local Postgres, and Postgres's own statistics.
Two minutes per phase.

| Per minute, 7 nodes, all quiet | Before P2 (2026-11-24) | After P2 (2026-11-25) |
|---|---|---|
| Readings received | 420 | 420 |
| Database transactions (≈ round trips) | 3,380 | 3,174 |
| Rows written | 864 | **486** |
| `noise_readings` inserts | 420 (one per reading) | **44** (one per table per 10 s) |
| `sensor_status` updates | 420 | 420 (P3 would cut this) |
| Size of a reading row (at 1 million rows) | 154 B | 182 B (adds `peak_db`, `samples`) |

With 2 tables talking (loud streaks, audio clips, ML) the numbers are the
same within a few percent.

**Idle check (P1):** the API ran for 150 s with no nodes, with every database
statement logged. It made its 5 start-up queries (offline check plus the
retention cleanups) and **nothing after that**.

## 2. What was built

- **P1. No queries while no node is on.** The 15 s offline check is skipped
  once every node has been silent longer than `SENSOR_STALE_SECONDS` and has
  been marked offline. It resumes with the next node message. The raw-readings
  cleanup runs daily instead of hourly.
- **P2. One reading row per table every 10 s** (`server/src/services/readingWindows.js`).
  Each row holds the average, the peak and the number of readings. **Every
  reading is still judged on its own, in real time**: violations, the 10 s
  duration rule, LEDs and the live dashboard are unchanged. Averages in
  analytics are weighted by `samples` and peaks use `peak_db`. On a crash, at
  most the last 10 s of averages are lost; the windows are written on a normal
  shutdown or deploy.
- **P3 (not built).** Update `sensor_status.last_seen` at most every 5 s instead
  of on every reading. That would cut `sensor_status` writes from 420 to ~84 per
  minute. It saves database work, but neither compute hours nor storage, so it
  isn't needed for the free plan.

## 3. Estimate for the 14-day study

**Assumptions:**
- **Studify opening hours (Asia/Manila):** Mon–Sat 10:00–01:00 (15 h), Sun
  15:00–01:00 (10 h), so **100 h per week**. The nodes are powered only then
  (DEPLOY_CHECKLIST.md).
- **7 tables**, all with sensors.
- **Neon free plan** (from the README, checked 2026-11-10; re-check on Neon's
  pricing page): 100 compute-unit hours (CU-h) per project per month, minimum
  compute 0.25 CU, sleeps after 5 min without queries, ~0.5 GB storage.
- The load stays at the minimum 0.25 CU (about 53 small queries per second).
  Check the Neon dashboard during the first days.

### Compute hours (Neon)

| Item | Hours awake |
|---|---|
| Nodes on: 14 days = 2 weeks × 100 h | 200 h |
| 5 min after closing until Neon sleeps, × 14 | ~1.2 h |
| Daily retention cleanup, if it runs outside opening hours (5 min) × 14 | ~1.2 h |
| Admins using the dashboard outside opening hours (assumed 30 min/day) | ~7 h |
| **Total for the 14 days** | **~210 h × 0.25 CU ≈ 52 CU-h** |

That is **about half of the 100 CU-h free allowance**. For comparison:

| Situation | CU-h |
|---|---|
| Before P1 (Neon never sleeps while the API is awake), 14 days | ~84 |
| After P1, 14-day study at opening hours | **~52** |
| After P1, opening hours for a **whole calendar month** (~429 h) | **~112: over the free 100** |

### Storage

| | Rows kept (7-day retention, 100 h/week) | Size |
|---|---|---|
| Before P2 (1 row per reading) | 2.52 million | ~390 MB |
| **After P2 (1 row per table per 10 s)** | **252,000** | **~46 MB** |

Incidents, violations, accounts and seat history add only a few MB.

## 4. Verdict

**Yes, the 14-day study fits the Neon free plan:** about 52 of 100 CU-h and
about 46 MB of ~500 MB.

Conditions:
- Power the nodes only during opening hours. With nodes on 24/7 the 14 days
  would need ~84 CU-h: still under 100, but with little room for anything else
  that month.
- Keep the rest of that calendar month light. Running the nodes every opening
  hour for a whole month (~112 CU-h) would exceed the free plan; if you keep
  collecting after the study, switch to a paid plan for that month.
- Set a usage alert in the Neon console, and look at *Compute usage* after the
  first 2–3 days to confirm the ~3.7 CU-h/day rate (52 ÷ 14).
- `enoise-dev` is a separate project with its own allowance, so development
  doesn't eat into production's.
