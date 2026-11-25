// Tiny local MQTT broker (aedes) for testing without HiveMQ. Plain MQTT on
// 127.0.0.1 only, no TLS, no passwords: never expose it to a network.
// Use it when Mosquitto isn't installed.
//
// Usage: node broker.js [--port 1883] [--verbose]
// Point the API at it with (in the shell that starts the server):
//   HIVEMQ_HOST=127.0.0.1  HIVEMQ_PORT=1883  MQTT_PROTOCOL=mqtt  HIVEMQ_USERNAME=  HIVEMQ_PASSWORD=
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { Aedes } from "aedes";

export async function startBroker({ port = 1883, host = "127.0.0.1", verbose = false, quiet = false } = {}) {
  const aedes = await Aedes.createBroker();
  const server = createServer(aedes.handle);
  const log = line => {
    if (!quiet) console.log(line);
  };

  aedes.on("client", c => log(`[broker] + ${c.id}`));
  aedes.on("clientDisconnect", c => log(`[broker] - ${c.id}`));
  if (verbose) {
    aedes.on("publish", (packet, c) => {
      if (c) log(`[broker] ${c.id} -> ${packet.topic} (${packet.payload.length} B)${packet.retain ? " retained" : ""}`);
    });
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  log(`[broker] MQTT listening on mqtt://${host}:${port}`);

  return {
    url: `mqtt://${host}:${port}`,
    aedes,
    close: () =>
      new Promise(resolve => {
        aedes.close(() => server.close(() => resolve()));
      })
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--port");
  startBroker({ port: i === -1 ? 1883 : Number(process.argv[i + 1]), verbose: process.argv.includes("--verbose") });
}
