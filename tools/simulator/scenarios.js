// Sound programs for the virtual node. Each scenario says, for second t,
// how loud the room really is (dB, before the microphone) and what the
// sound is (the label the mock ML service will report for a clip).
//
// Levels follow the first, UNCALIBRATED readings at Studify:
//   quiet room ~60 dB (mostly steady highway traffic, occasional trucks/horns)
//   someone talking ~80-90 dB
// Re-measure after calibration (docs/CALIBRATION.md) and update these.

export const STUDIFY_BASELINE_DB = 60;

// Small seeded random generator so a scenario plays the same way every run.
export function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Steady traffic: 60 dB +/- 1.5, with a slow "car passing" swell of up to
// +5 dB roughly every 25 s. Stays below a 68 dB warning threshold.
function ambient(t, rnd) {
  const swell = Math.max(0, Math.sin((2 * Math.PI * t) / 25)) ** 4 * 5;
  return { db: STUDIFY_BASELINE_DB + swell + (rnd() - 0.5) * 3, label: "traffic" };
}

// Builds a scenario from loud segments laid over the ambient background.
// A segment is { from, to, db, label, jitter }; `db` may be a function of
// the time inside the segment (for ramps).
function program(name, description, seconds, segments) {
  return {
    name,
    description,
    seconds,
    at(t, rnd) {
      for (const s of segments) {
        if (t >= s.from && t < s.to) {
          const base = typeof s.db === "function" ? s.db(t - s.from, s.to - s.from) : s.db;
          return { db: base + (rnd() - 0.5) * 2 * (s.jitter ?? 1.5), label: s.label };
        }
      }
      return ambient(t, rnd);
    }
  };
}

// A truck: rises, peaks, falls (triangle), about 7 s in total.
const pass = peak => (dt, len) => STUDIFY_BASELINE_DB + (peak - STUDIFY_BASELINE_DB) * (1 - Math.abs((2 * dt) / len - 1));

export const SCENARIOS = {
  quiet: program("quiet", "Studify baseline: steady traffic ~60 dB, no talking", 30, []),
  spike: program("spike", "One short loud burst (4 s of talking at ~85 dB), shorter than the duration threshold", 24, [
    { from: 5, to: 9, db: 85, label: "talking" }
  ]),
  talking: program("talking", "Sustained loud talking at ~85 dB for 18 s", 28, [{ from: 3, to: 21, db: 85, label: "talking" }]),
  shouting: program("shouting", "Sustained shouting at ~92 dB for 18 s", 28, [{ from: 3, to: 21, db: 92, label: "shouting" }]),
  laughing: program("laughing", "Sustained group laughter at ~84 dB for 18 s", 28, [{ from: 3, to: 21, db: 84, label: "laughing" }]),
  music: program("music", "Music from a speaker at ~88 dB for 18 s", 28, [{ from: 3, to: 21, db: 88, label: "music", jitter: 1 }]),
  phone: program("phone", "Phone ringing at ~80 dB for 8 s", 20, [{ from: 3, to: 11, db: 80, label: "phone", jitter: 1 }]),
  door_slam: program("door_slam", "One door slam (1 s at ~92 dB)", 14, [{ from: 5, to: 6, db: 92, label: "door_slam" }]),
  false_mix: program("false_mix", "Door slam, chair scrape, cough and a dropped object, 7 s apart", 34, [
    { from: 4, to: 5, db: 92, label: "door_slam" },
    { from: 11, to: 13, db: 80, label: "chair" },
    { from: 18, to: 19, db: 78, label: "cough" },
    { from: 25, to: 26, db: 86, label: "dropped_object" }
  ]),
  truck: program("truck", "A truck passing on the highway (~7 s, peak ~80 dB)", 22, [
    { from: 5, to: 12, db: pass(80), label: "truck", jitter: 0.8 }
  ]),
  horn: program("horn", "A car horn (2 s at ~88 dB)", 14, [{ from: 5, to: 7, db: 88, label: "horn", jitter: 0.8 }]),
  construction: program("construction", "Sustained hammering next door (~82 dB for 15 s): loud, but not a violation sound", 26, [
    { from: 3, to: 18, db: 82, label: "hammering" }
  ]),
  traffic_jam: program("traffic_jam", "Sustained horns/traffic (~79 dB for 15 s): loud, but not a violation sound", 26, [
    { from: 3, to: 18, db: 79, label: "traffic" }
  ]),
  mumble: program("mumble", "Sustained talking the classifier is unsure about (~82 dB, low confidence)", 26, [
    { from: 3, to: 18, db: 82, label: "mumble" }
  ])
};

// --count N without --scenario: each node plays a different scenario.
export const ROTATION = ["quiet", "talking", "false_mix", "music", "traffic_jam", "spike", "truck", "horn"];
