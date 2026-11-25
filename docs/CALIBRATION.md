# Calibrating the sensor nodes

Who this is for: the team members who calibrate the 7 nodes before the 14-day
deployment at Studify, and anyone writing the paper's measurement section.

Our nodes are **low-cost sensors, not sound level meters**. Calibration turns
"estimated dB" into "dB within ±X dB of a reference meter" for the sounds we
tested. Report the X you actually reach.

> **Calibrate only AFTER flashing firmware 1.1.0** (or later) to every node.
> Its 150 Hz high-pass filter changes the readings by about 1 dB in the
> speech/tone range and much more for low rumble, so a calibration made with
> older firmware is wrong for the new one. Re-calibrate after any firmware
> change to the measurement code, and after any hardware change (AGC, gain
> pin, microphone, enclosure).

---

## 1. What the system does now

| | Where | What it does |
|---|---|---|
| **Per-node correction** | Table Configuration → *Calibration offset (dB)* and *Calibration gain* (migration 018) | The API stores and judges `corrected = gain × raw + offset` for every reading, before thresholds and LEDs. Defaults: offset 0, gain 1 (= uncalibrated). The table page shows the raw value the node sent. |
| **Calibration mode** | Firmware 1.1.0: type `cal` + Enter in the Serial Monitor (115200 baud); `cal on` / `cal off` also work. Or build with `-DCALIBRATION_MODE=1`. | Prints one line per second, `[cal] node=NODE-003 fw=1.1.0 raw_db=61.2 rms_mv=31.40`, and publishes **no telemetry**, so test tones create no events. The node stays online. |
| **Firmware version** | Every reading: `{"db_level":61.3,"fw":"1.1.0"}` | Shown on the table page; write it on the log sheet. |
| **High-pass filter** | Firmware 1.1.0 | First-order filter at 150 Hz on every sample, against highway rumble (section 7). |
| **Base curve** | `CAL_TABLE` in `enoise_node.ino` | Turns mV into dB, the same in every node. Placeholder rows; the per-node correction above is applied on top of it. |
| **"dB (est.)" label** | `DB_CALIBRATED` in `capstone/src/constants.js`, `db_calibrated` in `server/src/controllers/systemController.js` | Set both to `true` when all nodes are calibrated and verified. |

**Why the correction is stored on the server:** the team can set and change it
from the dashboard during the study without re-flashing, and it is visible and
auditable for the paper. Storing it on the device would mean a USB cable for
every change, and it wouldn't be visible anywhere. The node keeps its
`NODE_ID` in flash, so the correction follows the physical node as long as its
ID doesn't change.

## 2. Before you calibrate: switch the microphone's AGC off (hardware)

The MAX9814 has **automatic gain control (AGC)**: it turns its own gain down
when it gets loud. The same sound then reads differently depending on what
came before, and loud sounds are compressed, which makes dB readings
unreliable. **The firmware cannot switch AGC off.** It is a hardware setting:

1. **If your MAX9814 board has a TH pin:** connect **TH to MICBIAS**. That
   disables the AGC (MAX9814 datasheet). Confirm on the bench: a sound 10 dB
   louder should now read about 10 dB higher.
2. **If the board doesn't expose TH** (many breakouts, including Adafruit's,
   don't): AGC can't be switched off on that board. Use a microphone without
   AGC instead: a **MAX4466** (analog, same wiring to GPIO34) or an **INMP441**
   (I2S digital, needs firmware changes).
3. **With AGC off, the gain is fixed**, so loud talking (80–90 dB) may clip at
   the highest gain. Set **GAIN to VDD (40 dB)** and check on the bench that
   the loudest test tone (80 dB) still reads below `DB_CEIL` and isn't flat.

**If you have to keep AGC on** (no time to change hardware): calibrate anyway,
use **gain + offset** (the tool chooses it automatically when needed), and
report in the paper that the sensor's response is compressed at high levels.

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

1. **Flash firmware 1.1.0** (with the node's own `secrets.h`). On the table page,
   check that it reports `Firmware 1.1.0`.
2. **Reset its correction:** Table Configuration → that table → offset **0**,
   gain **1** → Save.
3. **Power** the node from its normal adapter (not a laptop USB port) and let it
   run **5 minutes**.
4. **Switch on calibration mode:** Serial Monitor → type `cal` → Enter. It
   answers `Calibration mode ON: telemetry is NOT published.`
5. **Placement:** the reference meter's microphone and the node's microphone side
   by side, same height, pointing the same way, about **1 m** in front of the
   speaker. Keep the room quiet and stay out of the line between them.
6. **Play a 1 kHz tone** at three levels as read on the reference: about **50,
   65 and 80 dB(A)**. A-weighting is 0 dB at 1 kHz, so the reference's dB(A)
   and our node are directly comparable.
   - After changing the level, wait **5 s** before recording.
   - Record **30 seconds** at each level: the 30 `[cal]` lines from the node,
     and the reference reading (its 30 s average/LAeq, or a reading every few
     seconds).
7. **Compute** the correction (section 5). If (reference − node) changes by more
   than ~2 dB between the low and high level, the tool switches from a single
   offset to **gain + offset**. That is expected if the AGC is still on.
8. **Enter** the offset (and gain) in Table Configuration → Save.
9. **Verify with different sounds:** pink noise and a recording of normal
   talking, each at about **60 and 75 dB(A)**. Still in calibration mode, the
   `[cal]` lines show *raw* values, so run the tool with `--verify` (it applies
   your correction). Or switch calibration mode off (`cal`) and read the
   *corrected* value on the table page. **Pass if every level is within ±2 dB.**
   If you can't reach that, report the real figure.
   - Pink noise and traffic carry a lot of low-frequency energy. The 150 Hz
     filter removes part of it, A-weighting removes more. Expect the node to
     read somewhat **higher** than the meter for these sounds. That is the
     missing full A-weighting (section 7), not a bad calibration. Write it down.
10. **Switch calibration mode off:** type `cal` → Enter (`... published again`).
    Restarting the node also turns it off.
11. **Log** everything on the sheet (section 6).
12. **Repeat for every node.** Nodes from the same batch still differ, so never
    copy one node's correction to another.

## 5. Computing the correction

Make a CSV per node (Excel: *Save as CSV*). Use one row per second, or one row
per level with the averages. Take `node_dB` from `raw_db=` and `node_mv` from
`rms_mv=` in the `[cal]` lines:

```
level,reference_dB,node_dB,node_mv
50,50.1,45.6,10.04
50,49.9,45.5,10.01
...
65,65.0,60.6,50.30
80,80.1,75.5,250.1
```

```powershell
cd tools\calibration
node compute-offset.js NODE-003.csv
node compute-offset.js NODE-003.csv --verify NODE-003-verify.csv   # pink noise / talking
node compute-offset.js NODE-003.csv --tolerance 3                  # if +/-2 dB can't be reached
```

The tool prints, for each level, the average reference and node readings, the
difference, the corrected value and the remaining error. It then says whether
to use a single **offset** or **gain + offset**, and PASS or FAIL against the
tolerance. Type those numbers into Table Configuration. (It also prints
`CAL_TABLE` rows; only use those if you deliberately want a per-node curve in
the firmware instead of the dashboard correction.) Try it on the synthetic
examples: `node compute-offset.js examples/node-reads-low.csv` and
`examples/node-compresses.csv`.

When all nodes are done and verified, set `DB_CALIBRATED = true` and
`db_calibrated: true`, so the dashboard shows dB(A) instead of "dB (est.)".

## 6. Log sheet (one row per node per session)

| Node ID | Date | Firmware | AGC off? (how) | Reference device (model / app) | Levels played (dB(A)) | Correction (offset / gain) | Max error, calibration levels | Max error, verification (pink noise / talking) | Pass? | Who |
|---|---|---|---|---|---|---|---|---|---|---|
| NODE-001 | | 1.1.0 | | | 50 / 65 / 80 | | | | | |

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
> way, plus the highway rumble that the old firmware didn't filter. **Re-measure
> both after calibration before the thresholds are final.**

### Starting thresholds (provisional)

These are the defaults for new tables (`DEFAULT_WARNING_THRESHOLD` /
`DEFAULT_CRITICAL_THRESHOLD`), and what the simulator uses:

| Setting | Value | Reasoning |
|---|---|---|
| Warning | **68 dB** | Above the quiet baseline (60 dB) plus its normal traffic swells (up to ~66 dB in the simulator), so a quiet table stays green. |
| Critical | **75 dB** | 15 dB above the baseline (sounds roughly 3× as loud) and well below the 80–90 dB measured for talking, so sustained talking crosses it with margin. |
| Confirmation | **10 s** | The panel's duration rule. A truck (~7 s), a horn (2 s), a door slam or a cough never lasts 10 s. Simulator S2 and S5a–S5c: no event, no strike. |

Traffic that does last longer than 10 s (a traffic jam, horns) is checked by
the classifier and comes back as street noise (Ambient Baseline), so it is
logged as IGNORED: no strike, no critical bulb (simulator S5e).

### LED band edges (provisional defaults, built in)

`LED_GREEN_FLOOR_DB` (50) and `LED_RED_STEP_DB` (5), in `server/src/utils/ledLogic.js`.
With the thresholds above:

| LEDs | Rule | With 68 / 75 dB |
|---|---|---|
| Green 1–5 | 5 equal steps from a **quiet floor** (50 dB) up to the warning threshold, at least 1 | 50 → 1, 53.6 → 2, 57.2 → 3, 60.8 → 4, 64.4 → 5. The quiet room (~60 dB) shows 3 green, normal conversation 4–5. |
| Yellow 1–3 | thirds between warning and critical | 68 / 70.3 / 72.7 |
| Red 1–2 | **1 red at critical**, **2 red at critical + 5 dB** | 75 → 1 red (loud), 80 → 2 red (very loud) |
| Critical bulb | confirmed violation only | unchanged |

The floor is never closer than 10 dB to the warning threshold, so a table with
a low warning threshold still gets a 10 dB green range. Re-check both values
after the on-site baseline (section 8).

### The high-pass filter and A-weighting

A dB(A) meter turns low frequencies down a lot (A-weighting is about −19 dB at
100 Hz and −11 dB at 200 Hz). Highway rumble is mostly below ~200 Hz, so an
unfiltered node counts it at full strength. That raised our baseline and let
traffic swells get closer to the thresholds.

- **Firmware 1.1.0 has a first-order high-pass filter at 150 Hz**
  (`y = a · (y_prev + x − x_prev)`; `a` follows the real sample gap, ≈ 0.81 at
  4 kHz). It cuts most rumble and also removes the microphone's DC bias. At our
  ~4 kHz sampling it also lowers the 400–2,000 Hz range (speech, the 1 kHz
  tone) by about 1 dB. That is a constant the calibration absorbs, which is why
  you must **calibrate after flashing it**.
- **Real A-weighting (not built).** It needs a steady, higher sample rate
  (≥ 16 kHz, e.g. the I2S/DMA ADC mode) and a few biquad filters. That is
  possible on the ESP32 but is a rework. An **INMP441 I2S microphone** at
  16–48 kHz with A-weighting filters is the usual way, and it also removes the
  AGC problem. Suggest it as future work.

## 8. On-site baseline at Studify (before the 14-day deployment)

1. Mount every node in its **final position**.
2. Record the ambient level per table during **normal quiet use**, with the
   aircon on and a typical crowd, at three times of day within opening hours
   (e.g. 11:00, 16:00, 21:00), for 15 minutes each. Get the numbers from the
   table page's chart or from **Data Export → readings (CSV)**. Each row is a
   10 s average with its peak.
3. Per table, compute the median and the 90th percentile (a spreadsheet is
   fine).
4. Check that the thresholds and LED bands make sense against that baseline:
   - quiet tables sit in green (90th percentile at least ~2 dB below warning);
   - two people talking normally at the table reach yellow at most, **not red**;
   - talking loudly or music for 10+ seconds reaches red (and, with the
     classifier, the bulb).
5. Adjust warning/critical per table on the Thresholds page if a table differs
   (e.g. one by a window facing the highway). **Write down the chosen values and
   why.**
6. Re-check calibration **once a week**, **whenever a node is moved or
   re-flashed**, and at the **start and end** of the 14-day deployment (5 minutes
   per node with the 1 kHz tone at 65 dB in calibration mode is enough for a
   check).

## 9. Tips for the device

- Mount the mic at the **centre of the table**, at a fixed height, facing up or
  toward the seats, the same way on every table. Keep it away from aircon vents,
  walls and corners (reflections), and spots where elbows, bags or laptops hit it.
- Use a **foam windscreen** and a rubber/foam mount, so typing, table knocks and
  vibration don't register as loud sound.
- Don't cover the mic port with the enclosure. Leave an opening, the same on
  every unit.
- **AGC off** (section 2). The firmware already does the analog essentials: an
  ADC1 pin (GPIO34; ADC2 doesn't work with Wi-Fi on), DC removal (the
  high-pass filter), and RMS over ~4,000 samples per second. Give it a **clean
  3.3 V** supply.
- The firmware uses a fixed **1 s window** (close to a meter's "slow"
  response). Keep the same window in the firmware, the simulator
  (`TELEMETRY_INTERVAL_MS = 1000`) and the paper. The database stores 10 s
  averages (with the peak); the 10 s duration rule still uses every 1 s reading.
- Power from a **proper adapter**, not a laptop USB port (USB noise shows up in
  analog readings).
- **Time:** readings use the server's arrival time, so all nodes share one clock.
  The node syncs NTP only for TLS. Mention this in the paper.
- **Label each enclosure** with its node ID, flash the **same firmware version**
  to every node (the table page shows it), and write it on the log sheet.
- **Check Wi-Fi signal strength** at every table on the 2nd floor before the
  deployment (a phone Wi-Fi analyser app at table height). Aim for better than
  about −70 dBm.

## 10. How to describe it in the paper

> "Each node is a calibrated low-cost sensor, accurate to ±X dB (largest error
> at verification) against a [reference meter / NIOSH SLM app] for steady tones
> between 50 and 80 dB(A). The node measures sound pressure with a 150 Hz
> high-pass filter but no full A-weighting, so low-frequency sounds read
> somewhat higher than on a dB(A) meter."

Don't call it a certified or Class 1/2 sound level meter.
