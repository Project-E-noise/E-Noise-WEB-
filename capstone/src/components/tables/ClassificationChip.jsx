import { formatPercent } from "../../utils/formatting";

// The latest ML label for a table (from the YAMNet service, if it's running).
export function ClassificationChip({ classification, confidence, critical = false }) {
  return (
    <div className={`classify-chip ${critical ? "chip-crit" : ""}`}>
      <div className="chip-ico ico-g"><i className="ti ti-ear" aria-hidden="true" /></div>
      <div className="grow">
        <div className="chip-lbl">ML classification</div>
        <div className="chip-val">{classification || "No label yet"}</div>
        {classification && confidence != null && <div className="chip-conf">Confidence: {formatPercent(confidence)}%</div>}
      </div>
    </div>
  );
}
