import { LED_CONFIG } from "../../constants";

// Shows the 5 green / 3 yellow / 2 red / 1 critical LEDs. Which ones are on
// comes from the backend (led_state); this component never decides it.
// led_state: { green: number, yellow: number, red: number, critical: boolean }
// stale: no reading for a while -> the array is dimmed.
// The critical state is also shown as an icon + text, so it can be read
// without colour or animation.
export function LedArray({ ledState, large = false, stale = false }) {
  const state = ledState || { green: 0, yellow: 0, red: 0, critical: false };
  const row = (count, activeCount, color) =>
    Array.from({ length: count }, (_, i) => <span key={`${color}-${i}`} className={`led-dot led-dot-${color} ${i < activeCount ? "on" : "off"}`} />);
  const label = `LEDs: ${state.green} green, ${state.yellow} yellow, ${state.red} red${state.critical ? ", critical on (violation)" : ""}${stale ? " (no recent data)" : ""}`;

  return (
    <div className={`led-array ${large ? "large" : ""} ${stale ? "is-stale" : ""}`} role="img" aria-label={label} title="LED state reported by the backend">
      <div className="led-row">{row(LED_CONFIG.green, state.green, "g")}</div>
      <div className="led-row">{row(LED_CONFIG.yellow, state.yellow, "y")}</div>
      <div className="led-row">{row(LED_CONFIG.red, state.red, "r")}</div>
      <div className="led-row led-row-crit">
        <span className={`led-dot led-dot-crit ${state.critical ? "on blink" : "off"}`} />
        {state.critical && <span className="led-crit-label"><i className="ti ti-alert-octagon" aria-hidden="true" /> VIOLATION</span>}
      </div>
    </div>
  );
}
