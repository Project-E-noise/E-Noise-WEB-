/*
 * Project E-Noise - ESP32 LED wiring test
 *
 * Upload this sketch by itself to check the 11 LED outputs. It does not
 * need Wi-Fi, MQTT, or secrets.h. Each LED lights individually in sequence,
 * followed by a short all-on check and a repeating critical LED blink.
 *
 * Pins match firmware/enoise_node/enoise_node.ino.
 */

const int GREEN_PINS[] = {4, 5, 18, 19, 21};
const int YELLOW_PINS[] = {22, 23, 32};
const int RED_PINS[] = {25, 26};
const int CRITICAL_PIN = 27;

const unsigned long STEP_MS = 500;
const unsigned long ALL_ON_MS = 1000;
const unsigned long BLINK_MS = 300;

void setAllLeds(bool on) {
  const int value = on ? HIGH : LOW;
  for (int pin : GREEN_PINS) digitalWrite(pin, value);
  for (int pin : YELLOW_PINS) digitalWrite(pin, value);
  for (int pin : RED_PINS) digitalWrite(pin, value);
  digitalWrite(CRITICAL_PIN, value);
}

void setup() {
  Serial.begin(115200);

  for (int pin : GREEN_PINS) pinMode(pin, OUTPUT);
  for (int pin : YELLOW_PINS) pinMode(pin, OUTPUT);
  for (int pin : RED_PINS) pinMode(pin, OUTPUT);
  pinMode(CRITICAL_PIN, OUTPUT);

  setAllLeds(false);
  Serial.println("E-Noise LED test starting");
}

void testRow(const int* pins, size_t count, const char* color) {
  Serial.printf("Testing %s LEDs\n", color);
  for (size_t i = 0; i < count; ++i) {
    setAllLeds(false);
    digitalWrite(pins[i], HIGH);
    Serial.printf("  %s LED %u (GPIO %d)\n", color, (unsigned)(i + 1), pins[i]);
    delay(STEP_MS);
  }
}

void loop() {
  testRow(GREEN_PINS, sizeof(GREEN_PINS) / sizeof(GREEN_PINS[0]), "green");
  testRow(YELLOW_PINS, sizeof(YELLOW_PINS) / sizeof(YELLOW_PINS[0]), "yellow");
  testRow(RED_PINS, sizeof(RED_PINS) / sizeof(RED_PINS[0]), "red");

  setAllLeds(false);
  digitalWrite(CRITICAL_PIN, HIGH);
  Serial.println("Critical LED (GPIO 27) on");
  delay(STEP_MS);
  digitalWrite(CRITICAL_PIN, LOW);

  setAllLeds(true);
  Serial.println("All 11 LEDs on");
  delay(ALL_ON_MS);
  setAllLeds(false);
  delay(STEP_MS);

  Serial.println("Critical LED blink check");
  for (int i = 0; i < 4; ++i) {
    digitalWrite(CRITICAL_PIN, HIGH);
    delay(BLINK_MS);
    digitalWrite(CRITICAL_PIN, LOW);
    delay(BLINK_MS);
  }
}
