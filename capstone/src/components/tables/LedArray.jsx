import { LED_CONFIG } from "../../constants";

// Shows the 5 green / 3 yellow / 2 red / 1 critical LEDs. Which ones are on
// comes from the backend (led_state); this component never decides it.
// led_state: { green: number, yellow: number, red: number, critical: boolean }
export function LedArray({ ledState, large = false }) {
  const state = ledState || { green: 0, yellow: 0, red: 0, critical: false };
  const row = (count, activeCount, color) =>
    Array.from({ length: count }, (_, i) => <span key={`${color}-${i}`} className={`led-dot led-dot-${color} ${i < activeCount ? "on" : "off"}`} />);
  const label = `LEDs: ${state.green} green, ${state.yellow} yellow, ${state.red} red${state.critical ? ", critical on" : ""}`;

  return (
    <div className={`led-array ${large ? "large" : ""}`} role="img" aria-label={label} title="LED state reported by the backend">
      <div className="led-row">{row(LED_CONFIG.green, state.green, "g")}</div>
      <div className="led-row">{row(LED_CONFIG.yellow, state.yellow, "y")}</div>
      <div className="led-row">{row(LED_CONFIG.red, state.red, "r")}</div>
      <div className="led-row">
        <span className={`led-dot led-dot-crit ${state.critical ? "on blink" : "off"}`} />
      </div>
    </div>
  );
}
