import { secondsSince, useTick } from "../../hooks/useTick";

// Progress of a loud streak: "Loud for 6/10 s", then "Checking sound
// type..." while the server waits for the classifier, then the verdict.
// `monitoring` is the table's monitoring block from the API.
export function ConfirmationProgress({ table, compact = false }) {
  const now = useTick(500);
  const m = table.monitoring;
  if (!m) return null;

  const elapsed = Math.min(secondsSince(m.since, now) ?? 0, 3600);
  const required = Number(m.required_seconds) || 0;
  const critical = Boolean(table.led_state?.critical);

  if (m.decided) {
    return critical ? null : <div className={`confirm-progress ${compact ? "compact" : ""}`}><span className="confirm-text muted">Logged for review, still loud</span></div>;
  }

  const sustained = elapsed >= required;
  const percent = required ? Math.min(100, Math.round((elapsed / required) * 100)) : 100;
  const text = sustained ? (m.waiting_for_label ? "Checking sound type..." : "Deciding...") : `Loud for ${elapsed}/${required} s`;

  return (
    <div className={`confirm-progress ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <div className="confirm-bar" aria-hidden="true">
        <span className={sustained ? "checking" : ""} style={{ width: `${percent}%` }} />
      </div>
      <span className="confirm-text">
        <i className={`ti ${sustained ? "ti-ear" : "ti-clock-hour-3"}`} aria-hidden="true" /> {text}
      </span>
    </div>
  );
}
