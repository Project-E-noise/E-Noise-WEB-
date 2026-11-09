import { Topbar } from "../components/layout/Topbar";
import { ThresholdCard } from "../components/thresholds/ThresholdCard";
import { AsyncSection } from "../components/common/UiStates";
import { useTables } from "../hooks/useTables";
import { thresholdsApi } from "../services/thresholds";
import { useToast } from "../context/ToastContext";

const LED_MAPPING = [
  { color: "var(--led-green)", name: "Safe", range: "Below the warning threshold", leds: "1-5 green LEDs" },
  { color: "var(--led-yellow)", name: "Warning", range: "At or above the warning threshold", leds: "5 green + up to 3 yellow" },
  { color: "var(--led-red)", name: "Excessive", range: "At or above the critical threshold", leds: "5 green + 3 yellow + 2 red" },
  { color: "var(--danger)", name: "Critical (confirmed)", range: "Stays critical for the confirmation time", leds: "All LEDs on + critical bulb blinks", danger: true }
];

export default function Thresholds() {
  const tablesQuery = useTables();
  const { showToast } = useToast();
  const tables = tablesQuery.data?.tables ?? [];

  const save = async (tableId, payload) => {
    await thresholdsApi.update(tableId, payload);
    showToast("Threshold settings saved");
    tablesQuery.reload();
  };

  return (
    <div className="page">
      <Topbar title="Thresholds" subtitle="Noise levels that switch the LEDs and create incidents, per table">
        <button type="button" className="btn" onClick={tablesQuery.reload}><i className="ti ti-refresh" /> Refresh</button>
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
          <div className="auto-grid">
            {data.map(table => (
              <ThresholdCard key={`${table.id}-${table.updated_at}`} table={table} onSave={payload => save(table.id, payload)} />
            ))}
          </div>
        )}
      </AsyncSection>

      <section className="card">
        <div className="card-header"><h2 className="card-title">What the LEDs mean</h2></div>
        {LED_MAPPING.map(row => (
          <div className={`thr-row ${row.danger ? "danger" : ""}`} key={row.name}>
            <div className="thr-bar" style={{ background: row.color }} />
            <div>
              <div className="thr-name">{row.name}</div>
              <div className="thr-range">{row.range}</div>
            </div>
            <div className="thr-leds">{row.leds}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
