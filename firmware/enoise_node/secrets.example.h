// Copy this file to secrets.h (same folder) and fill in your values.
// secrets.h is in .gitignore, so your real passwords never get committed.

#pragma once

// Wi-Fi network the node joins (2.4 GHz only; the ESP32 can't use 5 GHz).
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// MQTT broker: same host as HIVEMQ_HOST in server/.env.
// Use ONE SET OF CREDENTIALS PER NODE (see README "Per-node MQTT
// credentials"): in the broker's access management create a user for this
// node that may only publish to enoise/<NODE_ID>/telemetry, /status,
// /audio and subscribe to enoise/<NODE_ID>/led, /audio-request. A stolen
// node then can't impersonate other tables.
#define MQTT_HOST "xxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_USERNAME "node-001"
#define MQTT_PASSWORD "THIS_NODES_PASSWORD"

// Root CA certificate of the broker, PEM format. The node checks the
// broker's TLS certificate against it (no more setInsecure()).
// HiveMQ Cloud uses Let's Encrypt, so this is normally "ISRG Root X1".
// Get it from your broker's documentation, or from the server itself:
//   openssl s_client -connect <MQTT_HOST>:8883 -showcerts </dev/null
// and copy the LAST certificate of the chain (the root), including the
// BEGIN/END lines. Keep the quotes and the "\n" at the end of every line.
// If the broker's CA changes, re-flash the nodes.
#define MQTT_CA_CERT \
  "-----BEGIN CERTIFICATE-----\n" \
  "PASTE THE BROKER ROOT CA CERTIFICATE HERE, ONE LINE PER \"...\\n\"\n" \
  "-----END CERTIFICATE-----\n"

// Must exactly match this table's "Sensor node ID" in Table Configuration.
// Change it for every node you flash (NODE-001, NODE-002, ...).
#define NODE_ID "NODE-001"
