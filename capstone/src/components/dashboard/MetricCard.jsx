// Small number card used at the top of several pages.
export function MetricCard({ label, value, unit, note, icon, iconClass = "ico-g" }) {
  return (
    <div className="m-card">
      <div className="m-head">
        <div className="m-label">{label}</div>
        {icon && <div className={`m-icon ${iconClass}`}><i className={`ti ${icon}`} aria-hidden="true" /></div>}
      </div>
      <div className="m-val">
        {value ?? "--"} {unit && <span className="m-unit">{unit}</span>}
      </div>
      {note && <div className="m-delta">{note}</div>}
    </div>
  );
}
