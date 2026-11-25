// A stand-in for the Python ML service, for tests. Serves /health and
// /classify on a random local port and answers with whatever `respond`
// returns (an object -> JSON 200, a number -> that status with no body).
import http from "http";

export async function startFakeMl(respond = () => ({ category: "Loud Conversation", confidence: 0.9, top_class: "Speech" })) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      requests.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "ok", model_loaded: true }));
      }
      const answer = respond(requests[requests.length - 1]);
      if (typeof answer === "number") {
        res.writeHead(answer);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    setResponse(fn) {
      respond = fn;
    },
    close: () => new Promise(resolve => server.close(resolve))
  };
}

// A minimal WAV header + silence, enough for isLikelyWav().
export function fakeWav(bytes = 3200) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(bytes, 40);
  return Buffer.concat([header, Buffer.alloc(bytes)]);
}
