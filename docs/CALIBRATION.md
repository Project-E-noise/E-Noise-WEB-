# Calibrating the sensor nodes

Who this is for: the team members who calibrate the 7 nodes before the 14-day
deployment at Studify, and anyone writing the paper's measurement section.

Our nodes are **low-cost sensors, not sound level meters**. Calibration turns
"estimated dB" into "dB within ±X dB of a reference meter" for the sounds we
tested. Report the X you actually reach.

---

## 1. How calibration works today

- The firmware turns the microphone's RMS voltage (mV) into dB with `CAL_TABLE`
  in `firmware/enoise_node/enoise_node.ino`: 4 rows, linear in 20·log10(mV).
  **The rows are placeholders, and the same table is in every node.**
- There is **no per-node offset or gain** anywhere (firmware, API or database).
  To give each node its own correction today, edit `CAL_TABLE` before flashing
  that node.
- The firmware already prints the raw values once per second on Serial
  (115200 baud): `[level] rms=12.34 mV -> 51.2 dB (3987 samples)`.
- There is **no calibration mode**. A node keeps publishing while you play test
  tones, so a loud tone starts a "loud streak" on its table. **Workaround that
  works today:** set that table to **PAUSED** (Thresholds page) while
  calibrating. Loud events are then logged as IGNORED (`table_paused`): no
  strikes, no bulb.
- The dashboard shows "dB (est.)" until `DB_CALIBRATED` is set to `true`
  (`capstone/src/constants.js`) and `db_calibrated` (`server/src/controllers/systemController.js`).

## 2. Proposed change (needs approval before it is built)

| # | Change | Changes behaviour? |
|---|---|---|
| C1 | **Per-node offset and gain, stored on the server** (migration 018: `tables.calibration_offset_db` default 0, `calibration_gain` default 1, editable in Table Configuration). The API applies `corrected = gain × raw + offset` to every reading, before thresholds and LEDs. With the defaults (0 dB, ×1), nothing changes until a node is calibrated. | Yes (only once you enter values) |
| C2 | **Calibration mode in the firmware.** Type `cal` + Enter in the Serial Monitor to toggle it (or build with `CALIBRATION_MODE 1`). It prints raw dB and mV once per second and **stops publishing telemetry**, so no events are created. The status stays online. | Yes (firmware) |
| C3 | Firmware version in the payload: `{"db_level":61.3,"fw":"1.1.0"}`. The API already ignores unknown fields. | Yes (firmware) |
| C4 | Optional first-order high-pass filter at ~150 Hz in the firmware, to reduce highway rumble (section 7). Needs re-calibration afterwards. | Yes (firmware) |

**Where to store the correction (C1).** On the **server**, the team can set and
change it from the dashboard during the study without re-flashing, and it is
visible and auditable for the paper. On the **device** (NVS flash), it travels
with the hardware even if the database is rebuilt, but every change needs a USB
cable and it isn't visible anywhere. Recommendation: server. The node keeps its
`NODE_ID` in flash, so the correction follows the physical node as long as its
ID doesn't change.

Already built (no behaviour change): `tools/calibration/compute-offset.js`, the
simulator's `--offset` / `--gain` options, and its `calibration` tone scenario.

## 3. Equipment

- **Reference meter.** Best is a Class 2 sound level meter borrowed from the
  school (physics or engineering lab). An acceptable fallback is the **NIOSH SLM**
  app on an iPhone (Android apps are less consistent). Write down which one you
  used; the paper must say it.
- Set the meter to **dB(A), slow** (or LAeq over 30 s if it has it).
- A speaker, a tone/noise generator (any free app or website: 1 kHz sine, pink
  noise), a tape measure, a quiet room, and a printed log sheet (section 6).
- A laptop with the Arduino IDE Serial Monitor, or
  `arduino-cli monitor -p COM3 -c baudrate=115200`.

## 4. Method (per node)

1. **Power** the node from its normal adapter (not a laptop USB port) and let it
   run **5 minutes**, so the electronics and the MAX9814's automatic gain settle.
2. **Stop it creating events:** set its table to PAUSED (today), or use
   calibration mode (after C2).
3. **Placement:** the reference meter's microphone and the node's microphone side
   by side, same height, pointing the same way, about **1 m** in front of the
   speaker. Keep the room quiet and stay out of the line between them.
4. **Play a 1 kHz tone** at three levels as read on the reference: about **50,
   65 and 80 dB(A)**. A-weighting is 0 dB at 1 kHz, so the reference's dB(A)
   and our unweighted node are directly comparable.
   - After changing the level, wait **5 s** before recording (the MAX9814's AGC
     needs a moment).
   - Record **30 seconds** at each level: the 30 `[level]` lines from the node,
     and the reference reading (its 30 s average/LAeq, or a reading every few
     seconds).
5. **Compute** the correction (section 5). If (reference − node) changes by more
   than ~2 dB between the low and high level, the tool switches from a single
   offset to **gain + offset**. That is expected with the MAX9814, because its
   AGC compresses loud sounds.
6. **Apply** it to the node (section 5).
7. **Verify with different sounds:** pink noise and a recording of normal
   talking, each at about **60 and 75 dB(A)**. Record and compute as before
   with `--verify`. **Pass if every level is within ±2 dB.** If you can't
   reach that, report the real figure.
   - Pink noise and traffic contain a lot of low-frequency energy, which
     A-weighting turns down and our node doesn't. Expect the node to read
     **higher** than the meter for these sounds. That difference is the
     missing A-weighting (section 7), not a bad calibration. Write it down.
8. **Log** everything on the sheet (section 6).
9. **Repeat for every node.** Nodes from the same batch still differ, so never
   copy one node's correction to another.

## 5. Computing and applying the correction

Make a CSV per node (Excel: *Save as CSV*). Use one row per second, or one row
per level with the averages:

```
level,reference_dB,node_dB,node_mv
50,50.1,45.6,10.04
50,49.9,45.5,10.01
...
65,65.0,60.6,50.30
80,80.1,75.5,250.1
```

`node_mv` (the `rms=` value) is optional; with it, the tool also prints
`CAL_TABLE` rows for that node.

```powershell
cd tools\calibration
node compute-offset.js NODE-003.csv
node compute-offset.js NODE-003.csv --verify NODE-003-verify.csv   # pink noise / talking
node compute-offset.js NODE-003.csv --tolerance 3                  # if +/-2 dB can't be reached
```

The tool prints, for each level, the average reference and node readings, the
difference, the corrected value and the remaining error. It then recommends a
single offset or gain + offset, says PASS or FAIL against the tolerance, and
(with `node_mv`) prints per-node `CAL_TABLE` rows. Try it on the synthetic
examples: `node compute-offset.js examples/node-reads-low.csv` and
`examples/node-compresses.csv`.

**How to apply it:**

- **Today (no code change):** paste the printed `CAL_TABLE` rows into
  `enoise_node.ino` and flash *that* node. Keep the edited file per node (e.g.
  `NODE-003` in the commit message or a copy), because the next node needs its
  own rows. Restore the shared file afterwards.
- **After C1 is built:** type the offset (and gain) into that table's row in
  Table Configuration. No flashing needed.
- When all nodes are done and verified, set `DB_CALIBRATED = true` and
  `db_calibrated: true`, so the dashboard shows dB(A) instead of "dB (est.)".

## 6. Log sheet (one row per node per session)

| Node ID | Date | Firmware version | Reference device (model / app) | Levels played (dB(A)) | Correction (offset / gain) | Max error, calibration levels | Max error, verification (pink noise / talking) | Pass? | Who |
|---|---|---|---|---|---|---|---|---|---|
| NODE-001 | | | | 50 / 65 / 80 | | | | | |

## 7. What we know about Studify (initial, uncalibrated readings)

- Quiet room: about **60 dB**. The hub is near a highway, so the quiet level is
  mostly steady traffic noise with occasional spikes (trucks, horns,
  motorcycles).
- Someone talking: about **80–90 dB**.

> **Warning:** 80–90 dB is louder than normal conversation, which is usually
> about 60–70 dB at 1 m (a raised voice is about 70–76, shouting about 80–88).
> Likely causes: the placeholder `CAL_TABLE`; a speaker much closer than 1 m
> (every halving of distance adds ~6 dB, so 60 dB at 1 m becomes ~72 dB at
> 25 cm); and the MAX9814's AGC. The 60 dB baseline may be inflated in the same
> way, plus the unweighted highway rumble. **Re-measure both after calibration
> before the thresholds are final.**

### Starting thresholds (provisional)

These are now the defaults for new tables (`DEFAULT_WARNING_THRESHOLD` /
`DEFAULT_CRITICAL_THRESHOLD`), and what the simulator uses:

| Setting | Value | Reasoning |
|---|---|---|
| Warning | **68 dB** | Above the quiet baseline (60 dB) plus its normal traffic swells (up to ~66 dB in the simulator), so a quiet table stays green. |
| Critical | **75 dB** | 15 dB above the baseline (sounds roughly 3× as loud) and well below the 80–90 dB measured for talking, so sustained talking crosses it with margin. |
| Confirmation | **10 s** | The panel's duration rule. A truck (~7 s), a horn (2 s), a door slam or a cough never lasts 10 s. Simulator S2 and S5a–S5c: no event, no strike. |

Traffic that does last longer than 10 s (a traffic jam, horns) is checked by
the classifier and comes back as street noise (Ambient Baseline), so it is
logged as IGNORED: no strike, no critical bulb (simulator S5e).

### LED band edges (proposal, needs approval: changes what the LEDs show)

Today, green = round(dB / warning × 5) with a minimum of 1. With a 60 dB room
that is always 4–5 green, so the green row says almost nothing. The 2 red LEDs
are either both off or both on. Proposal for the 11 LEDs, with the thresholds
above:

| LEDs | Today | Proposal |
|---|---|---|
| Green 1–5 | 1 + more as dB approaches the warning threshold, counted from 0 dB | Counted from a **quiet floor** (baseline − 10 = 50 dB) up to warning: 50 → 1, 54.5 → 2, 59 → 3, 63.5 → 4, then 5. The quiet room (60 dB) shows 3 green, normal conversation 4–5. |
| Yellow 1–3 | thirds between warning and critical (68 / 70.3 / 72.7) | unchanged |
| Red 1–2 | both at ≥ 75 | **1 red at ≥ 75** (critical), **2 red at ≥ 80** (critical + 5): "loud" vs "very loud" |
| Critical bulb | confirmed violation only | unchanged |

### A-weighting and a high-pass filter on our board

The firmware applies **no weighting and no filter**. Highway rumble (mostly
below ~200 Hz) is counted at full strength, while a dB(A) meter turns it down a
lot (A-weighting is about −19 dB at 100 Hz, −11 dB at 200 Hz). That raises our
baseline, and it also lets traffic swells get closer to the thresholds.

- **High-pass filter (feasible now).** A first-order filter at ~150 Hz costs a
  few multiplications per sample. At the firmware's ~4 kHz sampling that is
  trivial for the ESP32: `y = a * (y_prev + x - x_prev)` with `a ≈ 0.81`. It
  cuts most rumble. The sampling rate jitters a little (it is driven by
  `loop()`), so it is approximate, which is fine after calibration. Change C4.
- **Real A-weighting (not now).** It needs a steady, higher sample rate
  (≥ 16 kHz, e.g. the I2S/DMA ADC mode) and a few biquad filters. That is
  possible on the ESP32 but is a rework. An **INMP441 I2S microphone** at
  16–48 kHz with A-weighting filters is the usual way, and it also removes
  the AGC problem. Suggest it as future work.

## 8. On-site baseline at Studify (before the 14-day deployment)

1. Mount every node in its **final position**.
2. Record the ambient level per table during **normal quiet use**, with the
   aircon on and a typical crowd, at three times of day (morning, midday, late
   afternoon), for 15 minutes each. Get the numbers from the table page's chart
   or from **Data Export -> readings (CSV)**.
3. Per table, compute the median and the 90th percentile (a spreadsheet is
   fine).
4. Check that the thresholds make sense against that baseline:
   - quiet tables sit in green (90th percentile at least ~2 dB below warning);
   - two people talking normally at the table reach yellow at most, **not red**;
   - talking loudly or music for 10+ seconds reaches red (and, with the
     classifier, the bulb).
5. Adjust warning/critical per table on the Thresholds page if a table differs
   (e.g. one by a window facing the highway). **Write down the chosen values and
   why.**
6. Re-check calibration **once a week**, **whenever a node is moved or
   re-flashed**, and at the **start and end** of the 14-day deployment (5 minutes
   per node with the 1 kHz tone at 65 dB is enough for a check).

## 9. Tips for the device

- Mount the mic at the **centre of the table**, at a fixed height, facing up or
  toward the seats, the same way on every table. Keep it away from aircon vents,
  walls and corners (reflections), and spots where elbows, bags or laptops hit it.
- Use a **foam windscreen** and a rubber/foam mount, so typing, table knocks and
  vibration don't register as loud sound.
- Don't cover the mic port with the enclosure. Leave an opening, the same on
  every unit.
- Our MAX9814 is **analog with AGC**. The firmware already does the analog
  essentials: an ADC1 pin (GPIO34; ADC2 doesn't work with Wi-Fi on), DC offset
  removal, and RMS over ~4,000 samples per second. Give it a **clean 3.3 V**
  supply. An I2S digital mic (INMP441) is more consistent; consider it for a
  next version.
- The firmware uses a fixed **1 s window** (close to a meter's "slow"
  response). Keep the same window in the firmware, the simulator
  (`TELEMETRY_INTERVAL_MS = 1000`) and the paper.
- Power from a **proper adapter**, not a laptop USB port (USB noise shows up in
  analog readings).
- **Time:** readings use the server's arrival time, so all nodes share one clock.
  The node syncs NTP only for TLS. Mention this in the paper.
- **Label each enclosure** with its node ID, flash the **same firmware version**
  to every node, and write the version on the log sheet (C3 adds it to the
  payload).
- **Check Wi-Fi signal strength** at every table on the 2nd floor before the
  deployment (a phone Wi-Fi analyser app at table height). Aim for better than
  about −70 dBm.

## 10. How to describe it in the paper

> "Each node is a calibrated low-cost sensor, accurate to ±X dB (largest error
> at verification) against a [reference meter / NIOSH SLM app] for steady tones
> between 50 and 80 dB(A). The node measures unweighted sound pressure, so
> low-frequency sounds read higher than on a dB(A) meter."

Don't call it a certified or Class 1/2 sound level meter.
