# Virtual sensor nodes (no hardware, no cloud)

These tools run the whole E-Noise chain on one Windows laptop:

```
virtual-node.js  --MQTT-->  broker.js (local)  -->  API (server/)  -->  local Postgres
                                                      |  \--> WebSocket --> dashboard / ws-watch.js
                                                      \--> mock-ml.js (pretends to be YAMNet)
```

`virtual-node.js` behaves like `firmware/enoise_node/enoise_node.ino`. It uses the
same topics, the same `{"db_level":61.3}` payload once a second, the same retained
status and Last Will, and the same dB maths (`firmware-model.js` is a port of
`rmsToDb()` and the RMS window). It applies the LED commands the backend sends and
answers audio requests with a 1-second WAV clip. Use it to test before the real
devices exist, and as a backup demo at the defense if the hardware fails.

Nothing here touches Neon or HiveMQ. The broker is local and only listens on
127.0.0.1. The scenario runner starts the API itself, with every setting
passed in, from this folder, so `server/.env` is never read.

## One-time setup

You need Node.js 20+ and the local PostgreSQL from the main README.

```powershell
cd tools\simulator
npm install
```

Start the local Postgres if it isn't running (this machine's cluster is on port 5433):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D ..\..\.pgdata -o "-p 5433" -l ..\..\.pgdata\log.txt start
```

## Run every scenario automatically (about 12 minutes)

```powershell
node run-scenarios.js
```

This command:

1. drops and re-creates the database `enoise_sim` (only a local database whose name contains "sim"),
2. runs all migrations,
3. starts the broker, the mock ML service and the API,
4. creates the first admin through `/api/auth/register` with an invite code, and
   7 occupants through the client sign-up,
5. sets tables 1-5 to the proposed Studify thresholds (warning 68, critical 75 dB, 10 s),
6. plays each scenario and checks the API, the database rows and the WebSocket messages.

The table of results goes to `results/latest.md`, and the API's log to
`results/server.log`. To run only some scenarios, use
`node run-scenarios.js --only quiet,talking`. Scenario groups: `quiet`, `spike`,
`talking`, `shout`, `phone`, `false`, `mldown`, `repeat`, `five`, `offline`,
`malformed`, `restart`, `retention`, `calibration`.

Other settings: `SIM_PG_URL` (default `postgresql://enoise@127.0.0.1:5433`) and `SIM_DB`
(default `enoise_sim`).

The runner sets one test-only shortcut: `VIOLATION_COOLDOWN_SECONDS=3`, instead of
120 s, so that tables can be reused quickly.

## Run it by hand (for a demo)

Use four PowerShell windows, all in `tools\simulator`. The API must use a
**local** database, never Neon.

```powershell
# 1. broker
node broker.js --port 1883

# 2. mock ML service (the key must match ML_API_KEY in window 3)
$env:ML_API_KEY = "local-demo-key"; node mock-ml.js --port 8001

# 3. API, started from THIS folder so server\.env (Neon, HiveMQ) is not loaded.
#    (In PowerShell, $env:X = "" deletes X, so overriding .env values with
#    empty strings does not work; starting from here avoids the problem.)
$env:DATABASE_URL = "postgresql://enoise@127.0.0.1:5433/enoise"
$env:HIVEMQ_HOST = "127.0.0.1"; $env:HIVEMQ_PORT = "1883"; $env:MQTT_PROTOCOL = "mqtt"
$env:ML_SERVICE_URL = "http://127.0.0.1:8001"; $env:ML_API_KEY = "local-demo-key"
$env:JWT_SECRET = "local-demo-only-secret-change-me-0123456789"
node ..\..\server\src\server.js

# 4. one or more virtual nodes
node virtual-node.js --list                          # show the scenarios
node virtual-node.js --node NODE-002 --scenario talking
node virtual-node.js --count 5                       # NODE-001..005, a different scenario each
node virtual-node.js --node NODE-001 --scenario quiet --seconds 0   # until Ctrl+C
```

Then open the dashboard (`cd capstone; npm run dev`, http://127.0.0.1:5173, Live
Overview). You can also watch the raw WebSocket events:

```powershell
$env:ENOISE_ADMIN_EMAIL = "<admin email>"; $env:ENOISE_ADMIN_PASSWORD = "<password>"
node ws-watch.js --api http://localhost:5000
```

Each node prints one line per second: the reading, then the LEDs as the backend set
them (`GGGGG YYY RR C`, a dot = off), then the sound it is playing.

## Scenarios

| Name | What it plays |
|---|---|
| `quiet` | Studify baseline: steady traffic about 60 dB, a slow swell every 25 s |
| `spike` | 4 s of talking at about 85 dB (shorter than the 10 s threshold) |
| `talking` / `shouting` / `laughing` / `music` | 18 s at about 85 / 92 / 84 / 88 dB |
| `phone` | 8 s ringtone at about 80 dB (phone rule: 4 s) |
| `door_slam`, `false_mix` | 1-2 s door slam, chair scrape, cough, dropped object |
| `truck`, `horn` | a truck passing (7 s, peak 80 dB), a horn (2 s, 88 dB) |
| `construction`, `traffic_jam` | 15 s of loud sound that is not a violation sound |
| `mumble` | 15 s of talking the classifier is unsure about (confidence 0.31) |

The levels come from the first, **uncalibrated** Studify readings (quiet about 60 dB,
talking about 80-90 dB). Update `scenarios.js` after calibration.

## How the mock ML service decides

The virtual node writes the sound it is playing into the WAV clip, in an extra
RIFF chunk. `mock-ml.js` reads it and answers what YAMNet plus
`ml-service/category_mapping.py` would answer. For example, talking gives Speech
(Loud Conversation), door_slam gives Slam (Impact Noise), and truck gives Truck
(Ambient Baseline).

To simulate the ML service being off, send
`POST /__control {"mode":"down"}` to the mock, or just stop it.

## Files

| File | Purpose |
|---|---|
| `firmware-model.js` | Port of the firmware's dB maths, payload format, LED handling and WAV header |
| `scenarios.js` | Sound programs (dB level and sound type for each second) |
| `virtual-node.js` | The virtual node (CLI and `startVirtualNode()`) |
| `broker.js` | Local MQTT broker (aedes), for when Mosquitto isn't installed |
| `mock-ml.js` | Stand-in for the YAMNet service |
| `ws-watch.js` | Prints the WebSocket events the dashboard receives |
| `run-scenarios.js` | Runs everything and writes `results/latest.md` |
