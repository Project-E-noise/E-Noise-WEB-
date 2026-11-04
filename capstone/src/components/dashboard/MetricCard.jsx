export function MetricCard({ label, value, unit, delta, icon, iconClass = "ico-g", deltaClass = "neu" }) {
  return (
    <div className="m-card">
      <div className="m-head">
        <div className="m-label">{label}</div>
        <div className={`m-icon ${iconClass}`}>
          <i className={`ti ${icon}`} />
        </div>
      </div>
      <div className="m-val">
        {value} {unit && <span className="m-unit">{unit}</span>}
      </div>
      {delta && <div className={`m-delta ${deltaClass}`}>{delta}</div>}
    </div>
  );
}
