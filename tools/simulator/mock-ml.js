// Stand-in for ml-service/ (YAMNet), for testing violation gating without
// TensorFlow. Same endpoints and answer shape as the real service:
//   GET  /health    -> {"status":"ok","model_loaded":true}
//   POST /classify  -> {"category":"Loud Conversation","confidence":0.86,"top_class":"Speech"}
//
// Which answer? The virtual node puts the sound it is playing into the WAV
// ("talking", "door_slam", ...). The table below maps it to the YAMNet class
// and E-Noise category the real service would return
// (ml-service/category_mapping.py). Clips without a label get --label.
//
// Control (for test scripts):  POST /__control {"mode":"up"|"down"|"error", "label":"talking"}
//   down  = connections are dropped (like the laptop/tunnel being off)
//   error = every request answers 503
//
// Usage: node mock-ml.js [--port 8001] [--label talking] [--key <ML_API_KEY>]
import http from "node:http";
import { pathToFileURL } from "node:url";
import { labelFromWav } from "./firmware-model.js";

// label -> what YAMNet + category_mapping.py would say. top_class values
// are real YAMNet display names.
export const LABELS = {
  talking: { top_class: "Speech", category: "Loud Conversation", confidence: 0.86 },
  shouting: { top_class: "Shout", category: "Loud Conversation", confidence: 0.9 },
  laughing: { top_class: "Laughter", category: "Loud Conversation", confidence: 0.82 },
  music: { top_class: "Music", category: "Music", confidence: 0.88 },
  phone: { top_class: "Ringtone", category: "Mobile Phone Noise", confidence: 0.8 },
  door_slam: { top_class: "Slam", category: "Impact Noise", confidence: 0.81 },
  chair: { top_class: "Scrape", category: "Impact Noise", confidence: 0.7 },
  dropped_object: { top_class: "Thump, thud", category: "Impact Noise", confidence: 0.72 },
  hammering: { top_class: "Hammer", category: "Impact Noise", confidence: 0.78 },
  cough: { top_class: "Cough", category: "Ambient Baseline", confidence: 0.77 },
  typing: { top_class: "Typing", category: "Ambient Baseline", confidence: 0.7 },
  aircon: { top_class: "Air conditioning", category: "Ambient Baseline", confidence: 0.68 },
  traffic: { top_class: "Traffic noise, roadway noise", category: "Ambient Baseline", confidence: 0.74 },
  truck: { top_class: "Truck", category: "Ambient Baseline", confidence: 0.76 },
  horn: { top_class: "Vehicle horn, car horn, honking", category: "Ambient Baseline", confidence: 0.8 },
  quiet: { top_class: "Silence", category: "Ambient Baseline", confidence: 0.6 },
  // The classifier is unsure: below MIN_CONFIDENCE (0.5) -> UNVERIFIED (low_confidence).
  mumble: { top_class: "Speech", category: "Loud Conversation", confidence: 0.31 }
};

export function startMockMl({ port = 8001, host = "127.0.0.1", label = "quiet", key = "", quiet = false } = {}) {
  const state = { mode: "up", label, requests: [] };
  const log = line => {
    if (!quiet) console.log(line);
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const json = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };

      if (req.url === "/__control" && req.method === "POST") {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
          if (body.mode) state.mode = body.mode;
          if (body.label) state.label = body.label;
          log(`[mock-ml] mode=${state.mode} default label=${state.label}`);
          return json(200, { mode: state.mode, label: state.label });
        } catch {
          return json(400, { error: "bad control body" });
        }
      }
      if (state.mode === "down") return req.socket.destroy(); // like nothing listening
      if (state.mode === "error") return json(503, { detail: "model not loaded" });

      if (req.url === "/health" && req.method === "GET") return json(200, { status: "ok", model_loaded: true });

      if (req.url === "/classify" && req.method === "POST") {
        if (key && req.headers["x-api-key"] !== key) return json(401, { detail: "invalid API key" });
        const body = Buffer.concat(chunks);
        if (body.length < 44 || body.toString("ascii", 0, 4) !== "RIFF") return json(400, { detail: "not a WAV file" });
        const heard = labelFromWav(body) || state.label;
        const answer = LABELS[heard] || LABELS.quiet;
        state.requests.push({ at: new Date().toISOString(), heard, ...answer });
        log(`[mock-ml] classify: heard "${heard}" -> ${answer.category} (${answer.top_class}, ${answer.confidence})`);
        return json(200, { category: answer.category, confidence: answer.confidence, top_class: answer.top_class });
      }
      return json(404, { detail: "not found" });
    });
  });

  return new Promise(resolve =>
    server.listen(port, host, () => {
      log(`[mock-ml] listening on http://${host}:${port} (default label "${label}")`);
      resolve({
        url: `http://${host}:${port}`,
        state,
        setMode(mode) {
          state.mode = mode;
        },
        close: () =>
          new Promise(done => {
            server.closeAllConnections?.();
            server.close(done);
          })
      });
    })
  );
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMockMl({ port: Number(arg("port", 8001)), label: arg("label", "quiet"), key: arg("key", process.env.ML_API_KEY || "") });
}
