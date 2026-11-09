import { Topbar } from "../components/layout/Topbar";
import { ThresholdCard } from "../components/thresholds/ThresholdCard";
import { AsyncSection } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { thresholdsApi } from "../services/thresholds";
import { useToast } from "../context/ToastContext";

const LED_MAPPING = [
  { color: "#63B328", name: "Low / Safe", range: "Below warning threshold", leds: "1-5 green LEDs active" },
  { color: "#E8A020", name: "Warning", range: "At or above warning threshold", leds: "5 green + up to 3 yellow LEDs" },
  { color: "#E04444", name: "Excessive", range: "At or above critical threshold", leds: "5G + 3Y + up to 2 red LEDs" },
  { color: "#A32D2D", name: "Critical (confirmed)", range: "Sustained past confirmation duration", leds: "All 10 non-critical LEDs ON + critical indicator blinks", danger: true }
];

export default function Thresholds() {
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const tables = Array.isArray(tablesQuery.data) ? tablesQuery.data : tablesQuery.data?.tables ?? [];

  const save = async (tableId, payload) => {
    await thresholdsApi.update(tableId, payload);
    showToast("Threshold settings saved");
    tablesQuery.reload();
  };

  return (
    <div className="page active">
      <Topbar title="Thresholds" subtitle="Configure noise alert levels per table - LED mapping">
        <button className="btn" onClick={tablesQuery.reload}>
          <i className="ti ti-refresh" /> Refresh
        </button>
      </Topbar>

      <AsyncSection
        loading={tablesQuery.loading}
        error={tablesQuery.error}
        data={tables}
        isEmpty={d => !d.length}
        onRetry={tablesQuery.reload}
        emptyProps={{ icon: "ti-table", title: "No tables configured yet", subtitle: "Add tables under Table Configuration first." }}
      >
        {data => (
          <div className="two-grid">
            {data.map(table => (
              <ThresholdCard key={table.id} table={table} value={table} onSave={payload => save(table.id, payload)} />
            ))}
          </div>
        )}
      </AsyncSection>

      <div className="card">
        <div className="small-heading">LED indicator mapping</div>
        {LED_MAPPING.map(row => (
          <div className="thr-row" key={row.name} style={row.danger ? { border: "1px solid var(--r100)" } : undefined}>
            <div className="thr-bar" style={{ background: row.color }} />
            <div>
              <div className="thr-name" style={row.danger ? { color: "var(--r600)" } : undefined}>
                {row.name}
              </div>
              <div className="thr-range">{row.range}</div>
            </div>
            <div className="thr-leds" style={row.danger ? { color: "var(--r600)" } : undefined}>
              {row.leds}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
