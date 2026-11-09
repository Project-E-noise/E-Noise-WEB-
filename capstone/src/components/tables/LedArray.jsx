import { LED_CONFIG } from "../../constants";

// Renders the 5 green / 3 yellow / 2 red / 1 critical LED
// arrangement. States (inactive/active/blinking) come entirely from the
// backend-provided led_state — this component never decides them itself.
// led_state shape: { green: number, yellow: number, red: number, critical: boolean }
export function LedArray({ ledState, large = false }) {
  const state = ledState || { green: 0, yellow: 0, red: 0, critical: false };

  const row = (count, activeCount, colorClass) =>
    Array.from({ length: count }).map((_, i) => (
      <span key={`${colorClass}-${i}`} className={`led-dot led-dot-${colorClass} ${i < activeCount ? "on" : "off"}`} />
    ));

  return (
    <div className={`led-array2 ${large ? "large" : ""}`} title="LED state reported by backend/device telemetry">
      <div className="led-row">{row(LED_CONFIG.green, state.green, "g")}</div>
      <div className="led-row">{row(LED_CONFIG.yellow, state.yellow, "y")}</div>
      <div className="led-row">{row(LED_CONFIG.red, state.red, "r")}</div>
      <div className="led-row">
        <span className={`led-dot led-dot-crit ${state.critical ? "on blink" : "off"}`} />
      </div>
    </div>
  );
}
