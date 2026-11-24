// Virtual E-Noise sensor node: talks MQTT exactly like
// firmware/enoise_node/enoise_node.ino, so the backend can't tell it apart
// from a real ESP32.
//
//   enoise/<node>/telemetry      publishes {"db_level":61.3} every second (QoS 0, like PubSubClient)
//   enoise/<node>/status         {"online":true} retained on connect; {"online":false} as Last Will
//   enoise/<node>/led            applies the backend's LED command (never decides it itself)
//   enoise/<node>/audio-request  "captures" 1 s (no telemetry meanwhile) and sends a WAV on /audio
//
// Usage (from tools/simulator):
//   node virtual-node.js --node NODE-001 --scenario talking
//   node virtual-node.js --count 5                      # NODE-001..NODE-005, different scenarios
//   node virtual-node.js --node NODE-002 --scenario quiet --seconds 0   # run until Ctrl+C
//   node virtual-node.js --list                         # show the scenarios
// Options: --broker mqtt://127.0.0.1:1883  --username u --password p  --quiet
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import mqtt from "mqtt";
import {
  TELEMETRY_INTERVAL_MS,
  LED_FAILSAFE_MS,
  measureOneSecond,
  telemetryPayload,
  applyLedCommand,
  ledString,
  buildWav
} from "./firmware-model.js";
import { SCENARIOS, ROTATION, seededRandom } from "./scenarios.js";

const AUDIO_CAPTURE_MS = 1000; // the firmware's loop is blocked this long

/**
 * Starts one virtual node. Returns an EventEmitter with:
 *   events: "telemetry" (db, t), "led" (state), "audio" (label), "connect", "log" (line)
 *   led        current LED state as the node shows it
 *   stats      { telemetry, audio, ledCommands, maxRed, criticalSeen }
 *   setScenario(name), hang(), resume(), stop({ abrupt = true })
 */
export function startVirtualNode({
  nodeId = "NODE-001",
  broker = "mqtt://127.0.0.1:1883",
  username,
  password,
  scenario = "quiet",
  seconds,
  loop = false,
  seed,
  quiet = false
} = {}) {
  const node = new EventEmitter();
  const topics = {
    telemetry: `enoise/${nodeId}/telemetry`,
    status: `enoise/${nodeId}/status`,
    led: `enoise/${nodeId}/led`,
    audioRequest: `enoise/${nodeId}/audio-request`,
    audio: `enoise/${nodeId}/audio`
  };
  const rnd = seededRandom(seed ?? [...nodeId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  let program = SCENARIOS[scenario];
  if (!program) throw new Error(`Unknown scenario "${scenario}". Use --list to see them.`);
  let t = 0;
  let blockedUntil = 0; // audio capture in progress: no samples, no telemetry
  let skipNextReading = false;
  let hung = false;
  let lastLedAt = Date.now();
  let stopped = false;

  node.nodeId = nodeId;
  node.led = { green: 0, yellow: 0, red: 0, critical: false };
  node.stats = { telemetry: 0, audio: 0, ledCommands: 0, maxRed: 0, maxYellow: 0, criticalSeen: false, readings: [] };

  const log = line => {
    node.emit("log", line);
    if (!quiet) console.log(line);
  };

  // Same client id shape and Last Will as the firmware.
  const client = mqtt.connect(broker, {
    clientId: `enoise-${nodeId}-${Math.floor(rnd() * 0xffff).toString(16).padStart(4, "0")}`,
    username,
    password,
    keepalive: 30,
    reconnectPeriod: 2000,
    will: { topic: topics.status, payload: '{"online":false}', qos: 1, retain: true }
  });
  node.client = client;

  client.on("connect", () => {
    client.subscribe([topics.led, topics.audioRequest], { qos: 1 });
    client.publish(topics.status, '{"online":true}', { qos: 0, retain: true });
    log(`[${nodeId}] connected to ${broker}, playing "${program.name}"`);
    node.emit("connect");
  });
  client.on("error", err => log(`[${nodeId}] MQTT error: ${err.message}`));

  client.on("message", (topic, payload) => {
    if (topic === topics.audioRequest) {
      // The firmware sets a flag and captures in loop(): ~1 s blocked.
      if (Date.now() < blockedUntil) return;
      const label = program.at(t, rnd).label;
      blockedUntil = Date.now() + AUDIO_CAPTURE_MS;
      setTimeout(() => {
        if (stopped || !client.connected) return;
        client.publish(topics.audio, buildWav({ label }), { qos: 0 });
        node.stats.audio++;
        node.emit("audio", label);
        // The capture blocked the loop, so the next one-second window has
        // too few samples and is skipped (finishLevelWindow returns false).
        skipNextReading = true;
      }, AUDIO_CAPTURE_MS);
      return;
    }
    if (topic === topics.led) {
      try {
        node.led = applyLedCommand(JSON.parse(payload.toString()));
      } catch {
        log(`[${nodeId}] Bad LED payload`);
        return;
      }
      lastLedAt = Date.now();
      node.stats.ledCommands++;
      node.stats.maxRed = Math.max(node.stats.maxRed, node.led.red);
      node.stats.maxYellow = Math.max(node.stats.maxYellow, node.led.yellow);
      if (node.led.critical) node.stats.criticalSeen = true;
      node.emit("led", node.led);
    }
  });

  const duration = seconds ?? program.seconds;
  const timer = setInterval(() => {
    if (stopped) return;
    // LED failsafe: no command for 30 s -> all off (updateLedFailsafe()).
    if (Date.now() - lastLedAt > LED_FAILSAFE_MS) node.led = { green: 0, yellow: 0, red: 0, critical: false };

    const sound = program.at(t, rnd);
    t += 1;
    if (duration > 0 && t > duration) {
      if (loop) t = 0;
      else {
        node.emit("done");
        return;
      }
    }
    if (hung || !client.connected) return; // readings while offline are skipped, not queued
    if (Date.now() < blockedUntil || skipNextReading) {
      skipNextReading = Date.now() < blockedUntil ? skipNextReading : false;
      return;
    }
    const reading = measureOneSecond(sound.db, { random: rnd });
    if (!reading) return;
    client.publish(topics.telemetry, telemetryPayload(reading.db), { qos: 0 });
    node.stats.telemetry++;
    node.stats.readings.push(Number(reading.db.toFixed(1)));
    node.emit("telemetry", reading.db, t);
    log(`[${nodeId}] t=${String(t).padStart(3)}s ${reading.db.toFixed(1).padStart(5)} dB  ${ledString(node.led)}  (${sound.label})`);
  }, TELEMETRY_INTERVAL_MS);

  node.setScenario = name => {
    if (!SCENARIOS[name]) throw new Error(`Unknown scenario "${name}"`);
    program = SCENARIOS[name];
    t = 0;
  };
  // Keeps the MQTT connection but stops publishing (a frozen node).
  node.hang = () => {
    hung = true;
  };
  node.resume = () => {
    hung = false;
  };
  // abrupt = pulled the plug: the broker publishes the Last Will.
  node.stop = ({ abrupt = true } = {}) =>
    new Promise(resolve => {
      stopped = true;
      clearInterval(timer);
      if (abrupt) {
        client.stream?.destroy();
        client.end(true, {}, resolve);
      } else client.end(false, {}, resolve);
    });
  return node;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

// NODE-001 + 2 -> NODE-003 (keeps the zero padding)
function nthNode(base, offset) {
  const m = /^(.*?)(\d+)$/.exec(base);
  if (!m) return offset ? `${base}-${offset + 1}` : base;
  return m[1] + String(Number(m[2]) + offset).padStart(m[2].length, "0");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const s of Object.values(SCENARIOS)) console.log(`${s.name.padEnd(13)} ${String(s.seconds).padStart(3)} s  ${s.description}`);
    return;
  }
  const count = Number(args.count) || 1;
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const scenario = args.scenario || (count > 1 ? ROTATION[i % ROTATION.length] : "quiet");
    nodes.push(
      startVirtualNode({
        nodeId: nthNode(args.node || "NODE-001", i),
        broker: args.broker || process.env.SIM_BROKER_URL || "mqtt://127.0.0.1:1883",
        username: args.username || process.env.SIM_MQTT_USERNAME,
        password: args.password || process.env.SIM_MQTT_PASSWORD,
        scenario,
        seconds: args.seconds !== undefined ? Number(args.seconds) : undefined,
        loop: Boolean(args.loop),
        quiet: Boolean(args.quiet)
      })
    );
  }
  let done = 0;
  const finish = async () => {
    await Promise.all(nodes.map(n => n.stop({ abrupt: true })));
    process.exit(0);
  };
  for (const n of nodes) {
    n.on("done", () => {
      done++;
      if (done === nodes.length) finish();
    });
  }
  process.on("SIGINT", finish);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
