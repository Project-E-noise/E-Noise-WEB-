Iamona whole otherlevel could you lethimguesshe didn'talwaysme betterdoallI can just toshow youspecialsecond andshow up thatholdsmeasyellowin thefight got uphestarted looking at youonsick don't know what to sayitmugs# E-Noise Hardware Build Guide

This guide is for the current firmware in `firmware/enoise_node/enoise_node.ino` and a NodeMCU-32S style, 38-pin ESP-32S V1.1 board with USB-C. The board orientation and breadboard fit below are based on your photo/description and are **unverified: confirm on the bench**. The sketch compiled, but compilation does not prove hardware operation.

## One node in six lines

1. A NodeMCU-32S style ESP32 reads a MAX9814 microphone on GPIO34.
2. Eleven GPIOs drive five green, three yellow, two red, and one blinking critical LED through individual resistors.
3. The node estimates a sound level about once a second and sends telemetry over Wi-Fi and MQTT.
4. The backend sends the LED state on each accepted telemetry reading, retained at QoS 1.
5. After its critical confirmation logic, the backend commands the critical LED state; firmware supplies the blink.
6. A requested one-second audio clip is published as WAV from RAM and discarded; the firmware does not store it persistently.

## Bill of materials

| Part | Per node | Seven nodes, with about 10% LED/resistor spares | Have for node 1 | Buy for nodes 2–7 |
|---|---:|---:|---|---|
| NodeMCU-32S style 38-pin ESP-32S V1.1 (USB-C) | 1 | 7 | 1 owned | 6 |
| MAX9814 module, soldered pins | 1 | 7 | 1 owned | 6 |
| Green LEDs | 5 | 39 (35 + 4 spares) | 5 owned | 34 |
| Yellow LEDs | 3 | 23 (21 + 2 spares) | 3 owned | 20 |
| Red LEDs for ordinary red row | 2 | 15 (14 + 1 spare) | 2 owned | 13 |
| Red LED for critical row | 1 | 8 (7 + 1 spare) | 0 owned | 8 |
| 220 ohm LED resistors | 11 | 85 (77 + 8 spares) | Owned; count unverified, check for at least 11 | 74 if node 1 has 11; otherwise add the node-1 shortage |
| MB-102 breadboard or perfboard for final build | 1 | 7 | 2 owned; use one | 5 more if the second owned MB-102 is used for node 2; otherwise 6 |
| Male-to-male and female-to-male jumper wires | about 27 M-M per seated-board node; F-M for fallback | about 189 M-M, plus fallback leads | Both packs owned; counts unverified | Buy enough to meet totals |
| USB-C data cable | 1 | 7 | Must confirm / buy | 6 |
| USB power adapter | 1 per node | 7 | Must confirm / buy | 6 |
| Optional decoupling capacitor for mic supply | 1 | 7 | Not listed; optional | Optional |
| Small transistors | 0 | 0 | Not needed | Not needed |

The LED total is 85: 77 installed plus eight spares (about 10%). The resistor total is likewise 85. A red critical LED is recommended so it has a similar forward voltage/current to the other red indicators; white or blue can have too little voltage headroom from 3.3 V through 220 ohm and may be dim. Actual LED characteristics are **unverified: confirm on the bench**. USB cable and adapters are not confirmed in your parts list. Use one breadboard for node 1; the second is an optional alternative, not required for this layout.

## Board orientation, labels, and final pin map

Your reported board is marked `NODEMCU`, `ESP-32S`, `V1.1`; its labels are on the underside. In this guide, “top view” means chip side up with USB-C at the bottom and the pin-1 end farthest from USB. Silk labels `P4`, `P5`, etc. mean GPIO4, GPIO5, etc.; `SVP` means GPIO36 and `SVN` means GPIO39. Do not use the underside photo as a top-view orientation without mirroring left and right. The exact markings/orientation are **unverified: confirm on the bench**.

The pin positions below agree with the published Ai-Thinker NodeMCU-32S 38-pin pin sequence: left positions 1–19 and right positions 1–19. The documentation describes the board/module pinout; it does not confirm your clone's USB-C placement or underside silkscreen. See [Ai-Thinker NodeMCU-32S product specification](https://docs.ai-thinker.com/_media/esp32/docs/nodemcu-32s_product_specification.pdf). Your photo reading has no pin-sequence disagreement with that reference. Board orientation relative to the USB-C connector remains **unverified: confirm on the bench**.

| Printed label | GPIO | Side, top-view position | Breadboard column | Component | Direction | Note |
|---|---:|---|---|---|---|---|
| P34 | 34 | Left, 5 | N0+4 | MAX9814 OUT | Input | ADC1, input-only |
| P4 | 4 | Right, 13 | N0+12 | Green 1 | Output | LED branch |
| P5 | 5 | Right, 10 | N0+9 | Green 2 | Output | Strapping pin; boot flicker/boot interaction **unverified: confirm on the bench** |
| P18 | 18 | Right, 9 | N0+8 | Green 3 | Output | LED branch |
| P19 | 19 | Right, 8 | N0+7 | Green 4 | Output | LED branch |
| P21 | 21 | Right, 6 | N0+5 | Green 5 | Output | LED branch |
| P22 | 22 | Right, 3 | N0+2 | Yellow 1 | Output | LED branch |
| P23 | 23 | Right, 2 | N0+1 | Yellow 2 | Output | LED branch |
| P32 | 32 | Left, 7 | N0+6 | Yellow 3 | Output | ADC1-capable; used digitally |
| P25 | 25 | Left, 9 | N0+8 | Red 1 | Output | LED branch |
| P26 | 26 | Left, 10 | N0+9 | Red 2 | Output | LED branch |
| P27 | 27 | Left, 11 | N0+10 | Critical red | Output | Firmware blinks when commanded |
| 3V3 | — | Left, 1 | N0 | MAX9814 VDD | Power out | Never use 5V for the module |
| GND | — | Left, 14 | N0+13 | Left blue rail / MAX9814 GND | Ground | Connect this rail to ESP32 GND |
| GND | — | Right, 1 or 7 | N0 or N0+6 | Right blue rail | Ground | Connect separately to ESP32 GND |

Firmware constants are MIC 34; green `{4,5,18,19,21}`; yellow `{22,23,32}`; red `{25,26}`; critical 27; failsafe 30 seconds (`enoise_node.ino:78–89`).

### Board drawings

Positions are counted from the end farthest from USB. These drawings show the user's reported top view and are **unverified: confirm on the bench**.

```text
TOP VIEW — chip side up, USB-C at bottom; pin 1 at top
          LEFT HEADER                         RIGHT HEADER
 1  3V3  [mic power]                   [GND]  1
 2  EN   [do not use]                  [P23]  2  Yellow 2
 3  SVP  [GPIO36, input-only]          [P22]  3  Yellow 1
 4  SVN  [GPIO39, input-only]          [TX ]  4  do not use
 5  P34  [mic OUT]                     [RX ]  5  do not use
 6  P35  [input-only]                  [P21]  6  Green 5
 7  P32  [Yellow 3]                    [GND]  7
 8  P33  [unused]                      [P19]  8  Green 4
 9  P25  [Red 1]                       [P18]  9  Green 3
10  P26  [Red 2]                       [P5 ] 10  Green 2 (strap)
11  P27  [Critical]                    [P17] 11
12  P14  [unused]                      [P16] 12
13  P12  [strap; unused]               [P4 ] 13  Green 1
14  GND  [ground rail]                 [P0 ] 14  strap; unused
15  P13  [unused]                      [P2 ] 15  strap; unused
16  SD2  [flash; never use]            [P15] 16  strap; unused
17  SD3  [flash; never use]            [SD1] 17  flash; never use
18  CMD  [flash; never use]            [SD0] 18  flash; never use
19  5V   [do not use in this build]    [CLK] 19  flash; never use
```

```text
UNDERSIDE VIEW — mirror of the top-view drawing; USB-C end remains at bottom
The left and right columns swap sides. Position numbers still count from
the end farthest from USB. Printed underside text may itself be rotated.

             RIGHT header as seen from the top is now on viewer's left
             LEFT header as seen from the top is now on viewer's right
        (Use the printed labels, not visual left/right, to identify a pin.)
```

### Print-and-keep pin card

```text
E-NOISE NODEMCU-32S V1.1 — TOP VIEW / CHIP SIDE UP / USB-C DOWN
LEFT:  1 3V3 | 5 P34=MIC OUT | 7 P32=Y3 | 9 P25=R1 | 10 P26=R2
       11 P27=CRITICAL | 14 GND
RIGHT: 2 P23=Y2 | 3 P22=Y1 | 6 P21=G5 | 8 P19=G4 | 9 P18=G3
       10 P5=G2 (strap) | 13 P4=G1
Mic: VDD->3V3, OUT->P34, GND->GND; GAIN and A/R floating.
Every LED: GPIO -> individual 220 ohm resistor -> anode; cathode -> GND.
My pin-1 breadboard column N0 = ______. Write N0 here and above.
Column of pin n = N0 + n - 1. The same numbered columns align across b/i.
```

Write the breadboard column occupied by the board's left position-1 pin in the blank marked `N0`, then copy it into this guide. Under your described seating, pin position `n` lands in column `N0 + n - 1`. The matching left/right pins share a numbered column across the center channel. This mapping and your board's exact seating are **unverified: confirm on the bench**.

### Pins to avoid

Do not connect to `SD0`, `SD1`, `SD2`, `SD3`, `CMD`, or `CLK`: these are connected to module flash. Do not connect anything to `5V`, `TX`, `RX`, or `EN` in this build. GPIO0, GPIO2, GPIO12, and GPIO15 are boot strapping pins and stay unused. GPIO34, GPIO35, GPIO36, and GPIO39 are input-only; GPIO34 is used only for the microphone. GPIO5 is also a strapping pin and drives a green LED here: do not attach anything that forces its level at reset. A brief LED flicker during boot is possible; exact behavior is **unverified: confirm on the bench**. GPIO34 is on ADC1, avoiding the ESP32 ADC2/Wi-Fi limitation.

## MAX9814 wiring and settings

Read the tiny labels on your module itself; do not wire by position alone. The module labels are reported as `VDD`, `GND`, `OUT`, `GAIN`, and `A/R`; the usual pin order varies across breakout boards, so confirm against your board. This orientation and pin order are **unverified: confirm on the bench**.

| Module pin | Connect / setting |
|---|---|
| VDD | ESP32 3V3 only, never 5V |
| GND | ESP32 common GND / blue rail |
| OUT | P34 / GPIO34 |
| GAIN | Leave floating: reported 60 dB setting |
| A/R | Leave floating unless module documentation for this exact board says otherwise; the reported default is 1:4000 |

The reported gain options are floating=60 dB, GAIN to GND=50 dB, and GAIN to VDD=40 dB. The firmware comments/calibration assume the floating 60 dB choice. Lower gain usually makes both telemetry swings and audio samples smaller; AGC makes the difference non-constant, so changing gain can shift dB readings and affect audio classification. Exact breakout behavior is **unverified: confirm on the bench**.

## Power and resistor math

Power each board from its USB-C connector using a regulated USB adapter rated at least 5 V, 1 A, and a known data-capable cable. The board regulator supplies 3.3 V. Do not connect 5 V to a GPIO or simultaneously inject a separate supply into a rail while USB is connected.

Use one 220 ohm resistor in series with each LED. Its common four-band code is red-red-brown (the tolerance band may vary). For approximate example forward voltages, current is `(3.3 V - Vf) / 220 ohm`:

| Color | Example Vf | Approximate current |
|---|---:|---:|
| Green | 2.1 V | 5.5 mA |
| Yellow | 2.0 V | 5.9 mA |
| Red | 1.9 V | 6.4 mA |

All 11 on together would draw about 64 mA through the LED branches by these examples, in addition to ESP32, Wi-Fi, and microphone demand. These estimates are not measurements. The ESP32 datasheet's GPIO figures and board regulator capacity do not establish a safe aggregate limit for this exact clone; the current load and thermal behavior are **unverified: confirm on the bench**. If a light looks dim, check polarity, resistor placement, and row mapping; if unexpectedly bright, unplug and check the series resistor and wiring. Never bypass the resistor.

## Primary layout: ESP32 seated across one MB-102

Your described MB-102 has numbered columns with connected groups of five holes on each half: `a–e` form one group and `f–j` form another, separated by the center channel. With the board seated across the channel, each ESP32 header pin occupies `b` on the left half or `i` on the right half. The outer `a` or `j` hole in that same numbered column is the access point to that pin; the other three holes of that five-hole group are under the board. This access and fit are **unverified: confirm on the bench**.

Before wiring the circuit, with USB unplugged, insert one male-to-male jumper pin into the outer `a` hole next to a left-side pin and one into `j` beside a right-side pin. If either cannot seat because the board edge blocks it, use fallback Layout B below. The exact edge clearance is **unverified: confirm on the bench**.

The board occupies about columns 44–62; use columns 1–43 for the mic and LED branches. There are two blue ground rails, one along each long edge. Connect **both** blue rails to ESP32 GND when LEDs occupy both breadboard halves. Check the printed `+`/`−` markings at both rails before wiring; do not assume color alone identifies polarity. Rail marking and continuity are **unverified: confirm on the bench**.

Each LED branch below has a dedicated set of columns. Its GPIO jumper lands at column X; one 220 ohm resistor bridges X to X+3; the LED anode is in X+3 and its cathode in X+4. A separate ground jumper connects that cathode strip to the blue rail on its own side. No branches share a column strip. The resistor and LED leg fit and exact placement are **unverified: confirm on the bench**.

| LED | GPIO | ESP32 outer access hole | GPIO jumper lands | Resistor | LED anode | LED cathode | Ground wire |
|---|---:|---|---:|---|---:|---:|---|
| Yellow 3 | 32 | `a`, column N0+6 | 1 | 1 to 4 | 4 | 5 | Cathode col 5 to left blue rail |
| Red 1 | 25 | `a`, column N0+8 | 7 | 7 to 10 | 10 | 11 | Cathode col 11 to left blue rail |
| Red 2 | 26 | `a`, column N0+9 | 13 | 13 to 16 | 16 | 17 | Cathode col 17 to left blue rail |
| Critical red | 27 | `a`, column N0+10 | 20 | 20 to 23 | 23 | 24 | Cathode col 24 to left blue rail |
| Green 1 | 4 | `j`, column N0+12 | 1 | 1 to 4 | 4 | 5 | Cathode col 5 to right blue rail |
| Green 2 | 5 | `j`, column N0+9 | 7 | 7 to 10 | 10 | 11 | Cathode col 11 to right blue rail |
| Green 3 | 18 | `j`, column N0+8 | 13 | 13 to 16 | 16 | 17 | Cathode col 17 to right blue rail |
| Green 4 | 19 | `j`, column N0+7 | 19 | 19 to 22 | 22 | 23 | Cathode col 23 to right blue rail |
| Green 5 | 21 | `j`, column N0+5 | 25 | 25 to 28 | 28 | 29 | Cathode col 29 to right blue rail |
| Yellow 1 | 22 | `j`, column N0+2 | 31 | 31 to 34 | 34 | 35 | Cathode col 35 to right blue rail |
| Yellow 2 | 23 | `j`, column N0+1 | 37 | 37 to 40 | 40 | 41 | Cathode col 41 to right blue rail |

Place each branch within its named half (left LEDs in `a–e`, right LEDs in `f–j`). The two halves have separate five-hole strips despite sharing column numbers. For every row of the table, use a wire from the ESP32 outer hole to the listed landing column, a resistor from the landing column to the listed anode column, and an LED from anode to cathode column. Connect each cathode to its stated edge rail. The left half uses columns 1–24; the right half uses columns 1–41. Keep the MAX9814 in free left-half columns, leaving the listed LED strips clear.

For the microphone, use the left-row access points: position 1 `3V3` to module VDD, position 5 `P34` to OUT, and position 14 `GND` to module GND/left blue rail. Leave GAIN and A/R floating. Connect one ESP32 GND to the left blue rail and another ESP32 GND to the right blue rail. MB-102 rails may be split midway; with power off, inspect them. To verify without a multimeter, use a known working LED branch and test its cathode return at each end of each rail. If a segment fails, bridge that rail's split with a jumper and retest. Do not move wires while powered.

```text
MB-102 top view: rows a–e are left half; rows f–j are right half.
Each numbered column in the drawing is its own connected five-hole strip.

LEFT HALF (a–e), columns 1–43                 LEFT BLUE RAIL
cols:  1 2 3 4 5   7 8 9 10 11  13 14 15 16 17  20 21 22 23 24
       Y3 resistor/anode/cathode; R1; R2; CRIT. Mic uses clear columns 28–32.
GPIO:  32 jumper->1  25 jumper->7  26 jumper->13  27 jumper->20
GND:   ESP32 GND -------------------------------> left blue rail

RIGHT HALF (f–j), columns 1–43              RIGHT BLUE RAIL
cols:  1 2 3 4 5   7 8 9 10 11  13 14 15 16 17  19...23  25...29 31...35 37...41
       G1              G2              G3              G4     G5     Y1     Y2
GPIO:  4 jumper->1    5 jumper->7    18 jumper->13   19->19  21->25 22->31 23->37
GND:   ESP32 GND --------------------------------> right blue rail

ESP32 spans center channel; its pin headers sit in b and i. Its pin columns
are N0 through N0+18; GPIO jumper starts at the outer a/j access hole.
Connect MAX9814 VDD from left position 1 (3V3), OUT from left position 5
(P34), and GND to the left blue rail. Use columns 28–32 for its five pins.
```

Expected minimum jumper count is 27 male-to-male leads: 11 GPIO escapes, 11 LED-cathode-to-rail ground leads, 3 mic connections, one ESP32 GND-to-left-rail connection, and one ESP32 GND-to-right-rail connection. Add a jumper to bridge a split rail section on either edge, plus leads as needed for placement. This is an estimate; exact access and lead count are **unverified: confirm on the bench**.

### Build order

1. Unplug USB. Seat the board across the channel with its rows in b and i and USB-C hanging off the far end as described. Check the top-view pin-1 orientation and record `N0`.
2. Perform the outer-hole access test in `a` and `j`. Check that each jumper pin seats without force.
3. Connect ESP32 GND to both blue rails, one ground wire to each. Check the printed `+`/`−` marks on both rails, then check rail continuity with the known-LED method if either rail is split.
4. Place the MAX9814 in free columns with each pin in a separate strip. Read its silk labels; wire VDD/OUT/GND. Check GAIN and A/R remain floating.
5. Add LEDs one color group at a time in columns 1–43. Each GPIO jumper reaches its own resistor/LED branch; every cathode returns to the blue rail. Count 5 green, 3 yellow, 2 red, and 1 critical red.
6. Check GPIO5 branch does not force a reset strap level. No added wire goes to GPIO0, GPIO2, GPIO12, or GPIO15.
7. Inspect every connection against the pin table, check resistor bands, and look for adjacent-row shorts. Check 3V3 is not shorted to GND.
8. Print the pin card and write `N0` in both the card and this guide before the board labels are hidden.
9. Power through USB-C only and run the LED test below before the project firmware.

To remove the seated board, unplug USB and remove jumpers first. Rock it evenly side to side while lifting; do not twist the PCB. Support the breadboard and route the USB-C cable with slack so the connector does not lever the board. Both procedures are **unverified: confirm on the bench**.

### Layout B fallback only

If a male-to-male jumper will not seat in either outer `a` or `j` hole beside a board pin, place the ESP32 beside the MB-102. Use female-to-male leads: female ends on the ESP32 male headers and male ends in breadboard rows. Keep the same GPIO assignments, mic wiring, and one-board circuit. This is only the fallback if the primary access test fails; fit and cable strain are **unverified: confirm on the bench**.

## Standalone LED test sketch

Upload this temporary sketch before the full firmware. It lights each row for one second and blinks the critical LED. Use it only to confirm wiring; delete it from the IDE afterward if desired.

```cpp
const int greenPins[] = {4, 5, 18, 19, 21};
const int yellowPins[] = {22, 23, 32};
const int redPins[] = {25, 26};
const int criticalPin = 27;

void setup() {
  for (int p : greenPins) pinMode(p, OUTPUT);
  for (int p : yellowPins) pinMode(p, OUTPUT);
  for (int p : redPins) pinMode(p, OUTPUT);
  pinMode(criticalPin, OUTPUT);
}

void loop() {
  for (int p : greenPins) digitalWrite(p, HIGH);
  delay(1000);
  for (int p : greenPins) digitalWrite(p, LOW);
  for (int p : yellowPins) digitalWrite(p, HIGH);
  delay(1000);
  for (int p : yellowPins) digitalWrite(p, LOW);
  for (int p : redPins) digitalWrite(p, HIGH);
  delay(1000);
  for (int p : redPins) digitalWrite(p, LOW);
  for (int i = 0; i < 4; ++i) {
    digitalWrite(criticalPin, HIGH); delay(300);
    digitalWrite(criticalPin, LOW); delay(300);
  }
}
```

Pass: exactly the expected color row lights and the critical LED blinks. Fail: unplug first, then trace the label, GPIO jumper, resistor, polarity, and ground return. Boot interaction with GPIO5 is **unverified: confirm on the bench**.

## Raw-mic diagnostic sketch

Upload this standalone sketch for test (c) and calibration. Open Serial Monitor at 115200 baud. It reads GPIO34 in 50 ms windows and prints the minimum, maximum, and peak-to-peak ADC counts; reports are paced to about 250 ms apart.

```cpp
const int MIC_PIN = 34;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(MIC_PIN, ADC_11db);
}

void loop() {
  const uint32_t reportStart = micros();
  const uint32_t sampleStart = reportStart;
  int minimum = 4095;
  int maximum = 0;

  while ((uint32_t)(micros() - sampleStart) < 50000UL) {
    const int value = analogRead(MIC_PIN);
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }

  Serial.print("min=");
  Serial.print(minimum);
  Serial.print(" max=");
  Serial.print(maximum);
  Serial.print(" pp=");
  Serial.println(maximum - minimum);

  while ((uint32_t)(micros() - reportStart) < 250000UL) {
    delay(1);
  }
}
```

Use the minimum and maximum from a quiet interval and from a steady phone tone. The p-p value is `max - min`; convert it to volts as `p-p counts × 3.3 / 4095`. This conversion is the guide's stated estimate; actual ADC scaling on your board is **unverified: confirm on the bench**.

## Software setup and flashing

Use the latest stable Arduino IDE 2.x; do not rely on a particular IDE patch version. The verified compile toolchain was arduino-cli 1.5.1, ESP32 core 3.3.12, PubSubClient 2.8, ArduinoJson 6.21.5 and 7.4.3. In Boards Manager install Espressif ESP32 core 3.3.x; select `ESP32 Dev Module` (or the installed NodeMCU-32S profile if your IDE exposes it), choose the detected port, and begin at a moderate upload speed such as 115200. Select board option consistently with the compiled target before flashing.

Install PubSubClient 2.8 and ArduinoJson 6.21.x or 7.x. Open `firmware/enoise_node/enoise_node.ino`, set local Wi-Fi, HiveMQ, and NODE_ID values, then upload. If upload stalls at “Connecting…”, press and hold BOOT until writing begins; check the port, cable, and driver. NodeMCU-32S style boards commonly use CP2102 or CH340 USB bridge chips: inspect the chip marking or Windows Device Manager (Ports / device hardware description) and install the matching [Silicon Labs CP210x driver](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers) or [WCH CH340/CH341 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html). Do not assume the chip. USB bridge and upload behavior are **unverified: confirm on the bench**. Disconnect added connections to boot-strapping pins during upload; this map leaves GPIO0/2/12/15 unused.

## Per-node configuration

For each node, set `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_HOST`, `MQTT_USERNAME`, `MQTT_PASSWORD`, and unique `NODE_ID` in the sketch. Store credentials locally: add the actual secrets header or local credential copy to `.gitignore`, and change the sketch to include that local secrets header instead of committing real values. Do not commit credentials. The sketch's NODE_ID must match the `sensor_node_id` field for the table.

Dashboard setup: open **Table Configuration**, create/edit the row, enter the table number in **Table number** and the device identifier in **Sensor Node ID**, then save. The lookup is case-insensitive because it compares `LOWER(sensor_node_id)` with `LOWER($1)`, but it does not trim whitespace (`server/src/models/tablesModel.js:13–15`). For clarity, still use matching case and no leading/trailing spaces in the dashboard and firmware. The page is `capstone/src/pages/TableConfiguration.jsx`; verify the saved node ID before powering multiple devices.

| Node ID | Table number | Wi-Fi done | Flashed | Tested |
|---|---|---|---|---|
| NODE-001 | ______ | [ ] | [ ] | [ ] |
| NODE-002 | ______ | [ ] | [ ] | [ ] |
| NODE-003 | ______ | [ ] | [ ] | [ ] |
| NODE-004 | ______ | [ ] | [ ] | [ ] |
| NODE-005 | ______ | [ ] | [ ] | [ ] |
| NODE-006 | ______ | [ ] | [ ] | [ ] |
| NODE-007 | ______ | [ ] | [ ] | [ ] |

## Bring-up test plan

Perform tests in order. Serial output wording can vary slightly with current firmware/configuration; any expected log marker below should be checked against the sketch. Physical readings are **unverified: confirm on the bench**.

| Step | Test | Expected result / pass condition |
|---|---|---|
| a | Boot at 115200 baud | Serial boot messages appear and sketch proceeds; no repeated reset/brownout. Exact startup behavior **unverified: confirm on the bench**. |
| b | Upload standalone LED sketch | Five green, then three yellow, then two red light in sequence; critical red blinks. |
| c | Run the raw-mic diagnostic sketch below; note min/max/p-p in quiet, then repeat during a clap or phone tone near the mic | The sketch prints `min`, `max`, and `pp` counts at 115200 baud. The tone/clap should produce a larger p-p reading; exact values are **unverified: confirm on the bench**. |
| d | Wi-Fi | Serial reports Wi-Fi connected / IP. Check SSID/password and 2.4 GHz access if it fails. |
| e | MQTT and status | Serial reports MQTT connected; broker shows retained `enoise/NODE-001/status` with `{"online":true}`. |
| f | Telemetry | HiveMQ web client sees `enoise/NODE-001/telemetry`; dashboard table updates with matching Sensor Node ID. |
| g | Physical backend-driven LED change | Use real sound at the real node: play a tone from a phone near the mic and adjust volume so telemetry crosses warning/critical thresholds. Do not run the simulator with this node's ID while the real node publishes; competing telemetry streams can make LEDs flicker. |
| h | Physical critical confirmation | Keep the real sound at/above the table's critical threshold through the backend's 10-second confirmation; confirm the critical bulb is commanded and blinks. Do not use simulator telemetry for this physical test. |
| i | Audio | On request, look for `[audio] capture took N us (target 1000000)`; about 1,000,000 is the target, above about 1,050,000 suggests analogRead is too slow for 16 kHz. Check heap before/after capture and `Published 32044 bytes`. Broker and backend acceptance are **unverified: confirm on the bench**. |
| j | Unplug / Last Will | With node powered and connected, remove power without a graceful disconnect; backend/dashboard should mark it offline through the will. |
| k | 30-second LED failsafe | Keep node powered and online; stop the backend server so it sends no LED commands. Watch the LEDs go dark after about 30 seconds. Restart backend; next telemetry is handled and LED state is published again, so watch them recover. The backend publishes on every accepted telemetry reading (`server/src/services/telemetryService.js:51–53`) and retained QoS 1 (`server/src/mqtt/mqttClient.js:96–99`). |

For dashboard-only simulation, use the exact script commands from `server/`: `npm run simulate -- --node SIM-ONLY` for a gentle walk or `npm run simulate -- --node SIM-ONLY --spike` for a spike (flags `--node <id>` and `--spike`; `server/scripts/simulate-device.js:10–14`). Use an ID/table reserved for simulation and with no real device publishing, or power off the real node first. The script publishes retained QoS 1 online status, then QoS 1 telemetry every second with `db_level`, `classification`, `confidence`, and `timestamp`; Ctrl+C publishes retained offline status (`simulate-device.js:47, 59–72`). Do not use its telemetry to test the real node's LEDs.

## Calibration

The firmware's dB estimate is a rough peak-to-peak proxy, not a calibrated sound meter. Use a phone SPL app as a rough reference or, preferably, an SPL meter. Use the raw-mic diagnostic sketch above during calibration and keep the mic and reference device side by side in a quiet, stable setup.

1. Set the phone app or SPL meter to the weighting and response mode you will use consistently. Play a steady tone at a safe, stable volume near the mic.
2. In Serial Monitor, read several `min=... max=... pp=...` lines. Record the representative `pp` count while the sound is steady; do not use a single transient maximum.
3. Convert the recorded p-p counts to volts: `p-p volts = pp counts × 3.3 / 4095`. For example, if the observed count is `P`, enter the computed numeric voltage `P * 3.3 / 4095` as `MIC_REF_VOLTAGE` in the firmware (in volts, for example `0.023f`; replace that example with your calculated value).
4. At the same time and sound position, read the reference meter's displayed dB(A) value. Enter that numeric value as `MIC_REF_DB` (for example, if it reads 54.2 dB(A), set `MIC_REF_DB = 54.2f`).
5. Reflash with those two values, repeat the same sound/reference measurement, and compare the firmware telemetry with the reference at that point. Adjust the reference pair if needed, then check additional sound levels; one-point matching does not guarantee accuracy across a range.
6. Repeat calibration after changing mic gain, module, enclosure, placement, or firmware, and before relying on study results.

The MAX9814 has automatic gain control, while firmware uses a 50 ms peak-to-peak window, so this is not calibrated SPL and may not track transient or sustained sound like a certified meter. Phone app accuracy and your module's response are **unverified: confirm on the bench**.

## Mounting and placement

Place the mic opening toward the study area at a consistent height and distance; keep it away from direct airflow and handling noise. Keep the LEDs and USB cable far enough from the mic that their noise/light does not interfere with the study setup, and do not cover the mic opening with an enclosure. Route the USB cable with slack and support the breadboard so cable pull does not move components. Keep liquids away. Never put 5 V on GPIO; use common ground. Placement and acoustic effects are **unverified: confirm on the bench**.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No Wi-Fi | Wrong SSID/password, weak signal, unsupported network setup | Check credentials and 2.4 GHz availability; test near access point. |
| MQTT `rc=-2` | Network/TLS/host/port connection failure | Verify Wi-Fi, HiveMQ host, port 8883, internet, and broker availability. |
| MQTT `rc=5` | Broker authorization rejected | Check username/password and topic ACLs. |
| Flat or always-maximum dB | Wrong mic pin, no common ground, clipping, gain mismatch, ADC wiring issue | Verify module labels and P34; run raw ADC test; remove shorts. |
| LEDs all off after 30 s while node is online | No valid LED command received during failsafe interval | Check backend MQTT connection, telemetry ingestion, node/table ID, and ACL; backend LED state is telemetry-driven. |
| Upload errors | Charge-only cable, wrong COM port, driver, boot mode | Use data cable; identify CP2102/CH340 in chip marking or Device Manager, install matching driver, hold BOOT at connect. |
| Brownouts | Weak adapter/cable, short, or load issue | Unplug, inspect rails and LED series wiring, use a stable 5 V 1 A adapter/cable. |
| Audio publish failure | Network interruption or broker packet-size limit | Check `[audio]` failure logs and broker limit/ACL. HiveMQ plan limit is **unverified: confirm in broker console**. |
| Critical LED not blinking | Backend has not confirmed critical state, wrong GPIO27 wiring/polarity, or no LED command | Keep sound above threshold through confirmation; run LED test and check P27 branch. |
| GPIO5 LED flickers at boot | GPIO5 strap sampling at reset | Do not attach anything forcing a reset-time level; observe and compare boot with its LED jumper disconnected. **Unverified: confirm on the bench.** |
| Jumper won't reach pin | Board edge blocks outer access hole | Test `a` and `j`; if either is blocked, use Layout B with F-M jumpers. |

## Before you power it on

- [ ] Board seated across channel in b and i, USB-C end hanging off as planned.
- [ ] Outer-hole test in a and j done; use Layout B if blocked.
- [ ] Pin card printed and `N0` recorded in this guide.
- [ ] Every pin label and position checked against the reported map.
- [ ] MAX9814 VDD=3V3, OUT=P34, GND=common ground; GAIN/A/R float.
- [ ] All 11 LEDs have individual 220 ohm resistors and correct polarity.
- [ ] Printed `+`/`−` markings checked on both blue rails; each blue rail has its own ESP32 GND wire; rail sections checked; 3V3 and GND are not shorted.
- [ ] Nothing is connected to 5V, TX, RX, EN, flash pins, or unused strap pins.
- [ ] USB-C data cable and regulated 5 V adapter are confirmed.
- [ ] Credentials and unique NODE_ID match the Table Configuration row.

## Build one node first

Build NODE-001 first. Complete the unpowered inspection, outer-hole access test, temporary LED test, and raw mic test. Then flash the project firmware and verify Wi-Fi, MQTT/status, telemetry, dashboard update, backend LED response, critical confirmation/blink, audio request/publish, unplug/Last Will, and the 30-second failsafe. Record `N0`, ADC observations, serial logs, and any bench findings. Build the other six only after the first node's wiring and backend integration have been observed.

## Sources and bench-only limits

- [Ai-Thinker NodeMCU-32S product specification and pin definitions](https://docs.ai-thinker.com/_media/esp32/docs/nodemcu-32s_product_specification.pdf)
- [Espressif ESP32 GPIO guidance](https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32/api-reference/peripherals/gpio.html) and [hardware design guidelines](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32/schematic-checklist.html)
- [Espressif ESP32 datasheet](https://documentation.espressif.com/esp32_datasheet_en.html)
- [Analog Devices MAX9814 datasheet](https://cdn-shop.adafruit.com/datasheets/MAX9814.pdf) and [Adafruit MAX9814 breakout guide](https://learn.adafruit.com/adafruit-agc-electret-microphone-amplifier-max9814)
- [Arduino IDE downloads](https://www.arduino.cc/en/software) and [IDE 2 documentation](https://docs.arduino.cc/software/ide/)
- [Silicon Labs CP210x VCP drivers](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers)
- [WCH CH340/CH341 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html)

The exact board USB-C orientation, underside pin labels, board seating, outer-hole clearance, breadboard rail splits, module pin order/onboard parts, LED polarity/forward voltage, USB bridge chip, USB cable and adapter, ADC/audio timing, Wi-Fi/MQTT behavior, HiveMQ packet limit, and calibrated sound readings are **unverified: confirm on the bench**. Firmware compilation does not establish hardware behavior.
