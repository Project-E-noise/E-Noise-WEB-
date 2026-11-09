// Copy this file to secrets.h (same folder) and fill in your values.
// secrets.h is in .gitignore, so your real passwords never get committed.

#pragma once

// Wi-Fi network the node joins (2.4 GHz only; the ESP32 can't use 5 GHz).
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// HiveMQ Cloud broker: same host/credentials as HIVEMQ_* in server/.env.
// Tip: create a separate HiveMQ user for the devices.
#define MQTT_HOST "xxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_USERNAME "YOUR_HIVEMQ_USERNAME"
#define MQTT_PASSWORD "YOUR_HIVEMQ_PASSWORD"

// Must exactly match this table's "Sensor node ID" in Table Configuration.
// Change it for every node you flash (NODE-001, NODE-002, ...).
#define NODE_ID "NODE-001"
