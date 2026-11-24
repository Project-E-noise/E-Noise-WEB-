// JavaScript port of the parts of firmware/enoise_node/enoise_node.ino that
// decide what a node publishes, so the virtual node behaves like the real
// one. Keep the numbers in sync with the .ino file.
//
// What the real node does every second:
//   1. samples the MAX9814 on GPIO34 at ~4 kHz (analogReadMilliVolts)
//   2. removes the DC bias (mean) and takes the RMS of what is left (mV)
//   3. turns the RMS into dB with CAL_TABLE (linear in 20*log10(mV)),
//      clamped to DB_FLOOR..DB_CEIL
//   4. publishes {"db_level": <one decimal>} on enoise/<NODE_ID>/telemetry
// No A-weighting, no timestamp, no classification.

export const TELEMETRY_INTERVAL_MS = 1000;
export const LEVEL_SAMPLE_RATE_HZ = 4000; // LEVEL_SAMPLE_INTERVAL_US = 250
export const LEVEL_MIN_SAMPLES = 2000;
export const LED_FAILSAFE_MS = 30000;
export const AUDIO_SAMPLE_RATE_HZ = 16000;
export const AUDIO_CLIP_SECONDS = 1;

// Same rows as the firmware (PLACEHOLDER values there too).
export const CAL_TABLE = [
  { mv_rms: 2.0, db: 35.0 },
  { mv_rms: 10.0, db: 50.0 },
  { mv_rms: 50.0, db: 65.0 },
  { mv_rms: 250.0, db: 80.0 }
];
export const DB_FLOOR = 30.0;
export const DB_CEIL = 100.0;

const MIC_BIAS_MV = 1250; // MAX9814 output sits around 1.25 V

const log20 = mv => 20 * Math.log10(mv);

/** Port of rmsToDb(): multi-point calibration, linear in 20*log10(mV). */
export function rmsToDb(rmsMv) {
  const mv = Math.max(rmsMv, 0.01);
  const x = log20(mv);
  let i = 0;
  while (i < CAL_TABLE.length - 2 && mv > CAL_TABLE[i + 1].mv_rms) i++;
  const x0 = log20(CAL_TABLE[i].mv_rms);
  const y0 = CAL_TABLE[i].db;
  const x1 = log20(CAL_TABLE[i + 1].mv_rms);
  const y1 = CAL_TABLE[i + 1].db;
  const db = x1 === x0 ? y0 : y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  return Math.min(DB_CEIL, Math.max(DB_FLOOR, db));
}

/**
 * The inverse of rmsToDb (simulator only): which mV RMS would the mic give
 * for a sound of `db`, if CAL_TABLE were exactly right. Used to turn a
 * scenario's "true" sound level into microphone samples.
 */
export function dbToRms(db) {
  let i = 0;
  while (i < CAL_TABLE.length - 2 && db > CAL_TABLE[i + 1].db) i++;
  const a = CAL_TABLE[i];
  const b = CAL_TABLE[i + 1];
  const x = log20(a.mv_rms) + ((db - a.db) * (log20(b.mv_rms) - log20(a.mv_rms))) / (b.db - a.db);
  return 10 ** (x / 20);
}

/**
 * Simulates one second of ADC samples for a sound of `trueDb` and runs the
 * firmware's window maths on them (mean removal + RMS + rmsToDb).
 * Returns { db, rmsMv, samples } or null when too few samples were taken
 * (the firmware skips that second).
 */
export function measureOneSecond(trueDb, { samples = LEVEL_SAMPLE_RATE_HZ, random = Math.random } = {}) {
  if (samples < LEVEL_MIN_SAMPLES) return null;
  const targetRms = dbToRms(trueDb);
  // A tone plus a little noise; amplitude chosen so the AC RMS is targetRms.
  const amplitude = targetRms * Math.SQRT2;
  let sum = 0;
  let sumSq = 0;
  for (let n = 0; n < samples; n++) {
    const tone = amplitude * Math.sin((2 * Math.PI * 440 * n) / samples + random() * 0.05);
    const noise = (random() - 0.5) * targetRms * 0.1;
    // analogReadMilliVolts returns whole millivolts, 0..3300
    const mv = Math.min(3300, Math.max(0, Math.round(MIC_BIAS_MV + tone + noise)));
    sum += mv;
    sumSq += mv * mv;
  }
  const mean = sum / samples;
  const variance = Math.max(0, sumSq / samples - mean * mean);
  const rmsMv = Math.sqrt(variance);
  return { db: rmsToDb(rmsMv), rmsMv, samples };
}

/** The telemetry payload exactly as the firmware formats it ("%.1f"). */
export function telemetryPayload(db) {
  return `{"db_level":${db.toFixed(1)}}`;
}

/**
 * Port of onMqttMessage() for the LED topic: the node never decides the LED
 * state, it only applies what the backend sends (clamped to the row sizes).
 */
export function applyLedCommand(json) {
  const clamp = (v, max) => Math.min(max, Math.max(0, Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0));
  return {
    green: clamp(json.green, 5),
    yellow: clamp(json.yellow, 3),
    red: clamp(json.red, 2),
    critical: Boolean(json.critical)
  };
}

/** One-line picture of the 11 LEDs: GGGGG YYY RR C */
export function ledString(led) {
  if (!led) return "----- --- -- -";
  const row = (n, on, ch) => ch.repeat(on) + ".".repeat(n - on);
  return `${row(5, led.green, "G")} ${row(3, led.yellow, "Y")} ${row(2, led.red, "R")} ${led.critical ? "C" : "."}`;
}

/**
 * The WAV clip the firmware sends after an audio-request: 1 s, 16 kHz,
 * 16-bit mono PCM with a 44-byte header (buildWavHeader()).
 *
 * Simulator only: an extra RIFF chunk "elbl" carries the name of the sound
 * the scenario is playing ("talking", "door_slam"...). mock-ml.js reads it
 * to answer like YAMNet would. The real ML service ignores unknown chunks.
 */
export function buildWav({ label = "quiet", seconds = AUDIO_CLIP_SECONDS, rate = AUDIO_SAMPLE_RATE_HZ } = {}) {
  const dataBytes = rate * seconds * 2;
  const tag = Buffer.from(`ENOISE-LABEL:${label}`, "ascii");
  const tagChunk = Buffer.alloc(8 + tag.length + (tag.length % 2));
  tagChunk.write("elbl", 0, "ascii");
  tagChunk.writeUInt32LE(tag.length, 4);
  tag.copy(tagChunk, 8);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes + tagChunk.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);

  const data = Buffer.alloc(dataBytes);
  for (let n = 0; n < rate * seconds; n++) data.writeInt16LE(Math.round(2000 * Math.sin((2 * Math.PI * 440 * n) / rate)), n * 2);
  return Buffer.concat([header, data, tagChunk]);
}

/** Reads the simulator label back out of a WAV built by buildWav(). */
export function labelFromWav(buffer) {
  const match = /ENOISE-LABEL:([a-z_]+)/.exec(buffer.toString("latin1"));
  return match ? match[1] : null;
}
