# Database load for the 14-day study: measurements and proposal

Status: **proposal, nothing implemented.** Each item below needs your approval.

## 1. Measured today

`tools/simulator/measure-db-load.js`: the real API, 7 virtual nodes sending one
reading per second, a throwaway local Postgres, and Postgres's own statistics.
Two minutes per phase, 2026-11-24.

| Per minute, 7 nodes | All quiet | 2 talking, 5 quiet |
|---|---|---|
| Readings received | 420 | 415 |
| Database transactions (≈ round trips) | **3,380** (≈ 8 per reading) | 3,371 |
| Rows written | **864** | 869 |
| `noise_readings` inserts | 420 (one per reading) | 415 |
| `sensor_status` updates | 420 (one per reading) | 430 |
| `incidents` inserts | 0 | 1 |

Most transactions are reads: each reading looks up its table and sensor state,
then reads the table's full state (occupant, last incident, stats) to push it
to the dashboards.

**Storage per reading row:** 154 bytes (58 MB of table + 90 MB of indexes per
million rows, measured with 1,000,000 rows).

## 2. What this means on Neon free

Numbers from the README (checked 2026-11-10; verify on Neon's pricing page):
100 compute-unit hours (CU-h) per project per month, minimum compute 0.25 CU,
the database sleeps after 5 minutes without queries, and storage is about 0.5 GB
(the docs disagree; check the dashboard).

**Neon charges for time awake, not for the number of queries.** Any query at
least every 5 minutes keeps it awake, so making each query cheaper doesn't save
compute hours. Only longer quiet gaps do.

Two facts from the code matter here:

- The API's offline check (`server.js`, every 15 s) runs an UPDATE **even when no
  node is on**. While the API is awake (and the uptime pinger keeps it awake),
  Neon never sleeps. The README's "`/health` doesn't touch the database, so
  Neon can still sleep" is true for `/health`, but this 15 s timer defeats it.
- The hourly raw-readings cleanup wakes the database once an hour.

### Compute hours per month (0.25 CU)

| Situation | CU-h / month | Within 100? |
|---|---|---|
| **Today**, API kept awake 24/7 (pinger), nodes on or off | 0.25 × 24 h × 30 d = **~180** | No |
| Today, but only the 14 study days in a month | 0.25 × 24 × 14 = **~84** (+ any other use) | Just, with little margin |
| After **P1** (DB untouched while no node is on), nodes on 12 h/day | 0.25 × 12 × 30 = **~90** (+ dashboard use) | Yes, tight |
| After P1, nodes on 10 h/day | **~75** | Yes |
| P2 or P3 alone (fewer rows) | **unchanged** (still a query every second) | No change |
| Full buffering (engine state in memory, flush every 15 min) | ~**60** even 24/7 | Yes, but see below |

### Storage (7-day raw-readings retention, 7 nodes)

| Situation | Rows kept | Size |
|---|---|---|
| **Today**, nodes 24/7 (1 row per second) | 4.2 million | **~650 MB: over 0.5 GB** |
| Today, nodes 12 h/day | 2.1 million | ~330 MB (fits, little room left) |
| **P2**, one row per table per 10 s, 24/7 | 423,000 | **~65 MB** |
| P2 at 30 s, 24/7 | 141,000 | ~22 MB |

## 3. Proposal

**P1. Let Neon sleep when no node is on** (small, low risk). The 15 s offline
check skips the database when no telemetry has arrived since its last run and
nothing is marked online. The hourly readings cleanup becomes daily. Results are
identical to today; there are just no queries while everything is quiet. *Saves
compute only if the nodes are switched off part of the day.*

**P2. Store one reading row per table every 10 s instead of every second.**
- The violation engine keeps running on **every** reading, exactly as now.
  Streaks, the 10 s duration rule, audio requests and LEDs are unchanged, and
  violations are still decided in real time.
- Every 10 s the API writes one row per table: the **average** (same arithmetic
  mean the analytics use today), the **peak** and the number of readings.
  Migration 018 adds `peak_db` and `samples` to `noise_readings`.
- Live values on the dashboard still come from the latest reading (unchanged).
- Writes: `noise_readings` inserts drop from 420 to 42 per minute (−90%).
  Storage: ~650 MB → ~65 MB.
- Cost: raw-reading exports and charts become 10 s resolution instead of 1 s.
  Up to 10 s of averages are lost if the API restarts. Readings sent while the
  API sleeps or restarts are lost today anyway.

**P3. (Optional) Update `sensor_status.last_seen` at most every 5 s** instead of
on every reading. `sensor_status` writes drop from 420 to ~84 per minute.
Offline detection still works (it waits 15 s), at 5 s granularity.

**Not recommended for a 14-day study:** full buffering (engine state in memory,
database flushed every 15 min). It needs the dashboards, the offline check and
the 24 h stats to stop reading the database too, and it risks losing up to 15
minutes of data on every restart. It is a big rewrite for ~30 CU-h.

### Recommendation

- **P2 (needed):** at one row per second, a 24/7 deployment doesn't fit in the
  free storage.
- **P1 plus nodes on only during Studify's opening hours:** that fits the
  free compute.
- If the nodes must run 24/7, plan for **Neon's paid plan for the study month**
  (check the current price). Either way, set a usage alert in the Neon console.
- P3 is optional.

With P1 and P2, nodes on 12 h/day: about 90 CU-h and under 70 MB. With P2
only, 24/7: about 84 CU-h for exactly 14 days, but the rest of that month has
almost no headroom.
