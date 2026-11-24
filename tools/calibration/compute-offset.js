// Computes a node's calibration from paired readings (reference meter vs node).
//
//   node compute-offset.js readings.csv [--tolerance 2] [--verify verify.csv] [--json]
//
// CSV columns (header row required, any order):
//   level         a label for each test level, e.g. 50, 65, 80 (rows with the same
//                 label are averaged: put every 1-second reading of the 30 s in)
//   reference_dB  what the reference meter showed (dB(A), slow)
//   node_dB       what the node reported at the same time
//   node_mv       optional: the node's "rms=... mV" from its Serial output;
//                 if present, CAL_TABLE rows for the firmware are printed too
//
// Method (docs/CALIBRATION.md):
//   offset = average over the levels of (reference - node)
//   if (reference - node) changes by more than 2 dB between the levels, a single
//   offset is not enough: use a two-point fit  corrected = gain * node + offset
//   (least squares over the level averages). Each level's remaining error is
//   checked against --tolerance (default +/-2 dB).
// --verify applies the chosen correction to a second CSV recorded with a
// different sound (pink noise, talking) and checks that too.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_TOLERANCE_DB = 2;
export const SPREAD_LIMIT_DB = 2; // above this, use gain + offset

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  if (lines.length < 2) throw new Error("The CSV needs a header row and at least one reading.");
  const header = lines[0].split(",").map(h => h.trim());
  const col = name => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const idx = { level: col("level"), ref: col("reference_dB"), node: col("node_dB"), mv: col("node_mv") };
  if (idx.level < 0 || idx.ref < 0 || idx.node < 0) throw new Error("The CSV needs the columns level, reference_dB and node_dB.");
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map(c => c.trim());
    const num = (j, name) => {
      const v = Number(cells[j]);
      if (!Number.isFinite(v)) throw new Error(`Row ${i + 2}: ${name} "${cells[j]}" is not a number.`);
      return v;
    };
    return {
      level: cells[idx.level],
      ref: num(idx.ref, "reference_dB"),
      node: num(idx.node, "node_dB"),
      mv: idx.mv >= 0 && cells[idx.mv] !== "" ? num(idx.mv, "node_mv") : null
    };
  });
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Averages the rows of each level, in the order the levels first appear. */
export function levelAverages(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.level)) groups.set(r.level, []);
    groups.get(r.level).push(r);
  }
  return [...groups.entries()].map(([level, rs]) => {
    const mvs = rs.map(r => r.mv).filter(v => v != null);
    return { level, n: rs.length, ref: mean(rs.map(r => r.ref)), node: mean(rs.map(r => r.node)), mv: mvs.length ? mean(mvs) : null };
  });
}

/** Least-squares line ref = gain * node + offset through the level averages. */
function fitLine(levels) {
  const x = levels.map(l => l.node);
  const y = levels.map(l => l.ref);
  const mx = mean(x);
  const my = mean(y);
  const sxx = x.reduce((s, xi) => s + (xi - mx) ** 2, 0);
  if (sxx === 0) return { gain: 1, offset: my - mx };
  const gain = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0) / sxx;
  return { gain, offset: my - gain * mx };
}

export function errorsFor(levels, { gain, offset }) {
  return levels.map(l => ({ ...l, corrected: gain * l.node + offset, error: gain * l.node + offset - l.ref }));
}

/**
 * Returns { levels, differences, spread, model: {type, gain, offset}, errors, maxError, pass, calTable }.
 */
export function computeCalibration(rows, { tolerance = DEFAULT_TOLERANCE_DB } = {}) {
  const levels = levelAverages(rows);
  if (!levels.length) throw new Error("No readings.");
  const differences = levels.map(l => l.ref - l.node);
  const spread = Math.max(...differences) - Math.min(...differences);
  const useFit = levels.length >= 2 && spread > SPREAD_LIMIT_DB;
  const model = useFit ? { type: "gain+offset", ...fitLine(levels) } : { type: "offset", gain: 1, offset: mean(differences) };
  const errors = errorsFor(levels, model);
  const maxError = Math.max(...errors.map(e => Math.abs(e.error)));
  // CAL_TABLE rows for the firmware: (mV RMS, reference dB) per level, sorted by mV.
  const calTable = levels.every(l => l.mv != null) ? [...levels].sort((a, b) => a.mv - b.mv).map(l => ({ mv_rms: l.mv, db: l.ref })) : null;
  return { levels, differences, spread, model, errors, maxError, pass: maxError <= tolerance, tolerance, calTable };
}

function report(result, verify) {
  const out = [];
  const { model } = result;
  out.push("Level averages (reference vs node):");
  out.push("  level   n   reference   node    ref-node   corrected   error");
  for (const e of result.errors) {
    out.push(`  ${String(e.level).padEnd(6)} ${String(e.n).padStart(3)}   ${e.ref.toFixed(2).padStart(8)}  ${e.node.toFixed(2).padStart(7)}  ${(e.ref - e.node).toFixed(2).padStart(8)}  ${e.corrected.toFixed(2).padStart(10)}  ${(e.error >= 0 ? "+" : "") + e.error.toFixed(2)}`);
  }
  out.push("");
  out.push(`Spread of (reference - node) across levels: ${result.spread.toFixed(2)} dB (limit for a single offset: ${SPREAD_LIMIT_DB} dB)`);
  if (model.type === "offset") out.push(`Use a single OFFSET: ${model.offset >= 0 ? "+" : ""}${model.offset.toFixed(2)} dB   (corrected = node + offset)`);
  else out.push(`Use GAIN + OFFSET: gain ${model.gain.toFixed(4)}, offset ${model.offset >= 0 ? "+" : ""}${model.offset.toFixed(2)} dB   (corrected = gain x node + offset)`);
  out.push(`Largest remaining error: ${result.maxError.toFixed(2)} dB -> ${result.pass ? "PASS" : "FAIL"} (tolerance +/-${result.tolerance} dB)`);
  if (result.calTable) {
    out.push("");
    out.push("Firmware CAL_TABLE rows for THIS node (enoise_node.ino), if you calibrate in the firmware instead:");
    for (const r of result.calTable) out.push(`  { ${r.mv_rms.toFixed(2).padStart(7)}f, ${r.db.toFixed(1)}f },`);
  }
  if (verify) {
    out.push("");
    out.push("Verification with a different sound (correction above applied):");
    for (const e of verify.errors) out.push(`  ${String(e.level).padEnd(10)} reference ${e.ref.toFixed(2)}  corrected ${e.corrected.toFixed(2)}  error ${(e.error >= 0 ? "+" : "") + e.error.toFixed(2)}`);
    out.push(`Largest verification error: ${verify.maxError.toFixed(2)} dB -> ${verify.pass ? "PASS" : "FAIL"} (tolerance +/-${result.tolerance} dB)`);
  }
  return out.join("\n");
}

function parseArgs(argv) {
  const args = { files: [], tolerance: DEFAULT_TOLERANCE_DB, verify: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--tolerance") args.tolerance = Number(argv[++i]);
    else if (argv[i] === "--verify") args.verify = argv[++i];
    else args.files.push(argv[i]);
  }
  return args;
}

function main(argv) {
  const { files, tolerance, verify: verifyFile, json } = parseArgs(argv);
  if (files.length !== 1 || !Number.isFinite(tolerance)) {
    console.error("Usage: node compute-offset.js readings.csv [--tolerance 2] [--verify verify.csv] [--json]");
    process.exit(1);
  }
  const result = computeCalibration(parseCsv(fs.readFileSync(files[0], "utf8")), { tolerance });
  let verify = null;
  if (verifyFile) {
    const levels = levelAverages(parseCsv(fs.readFileSync(verifyFile, "utf8")));
    const errors = errorsFor(levels, result.model);
    const maxError = Math.max(...errors.map(e => Math.abs(e.error)));
    verify = { errors, maxError, pass: maxError <= tolerance };
  }
  if (json) {
    const r = v => (typeof v === "number" ? round(v, 3) : v);
    console.log(JSON.stringify({ ...result, verify }, (k, v) => r(v), 2));
  } else console.log(report(result, verify));
  process.exit(result.pass && (!verify || verify.pass) ? 0 : 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
