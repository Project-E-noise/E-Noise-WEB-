import { useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { Select } from "../components/common/FormFields";
import { AsyncSection } from "../components/common/UiStates";
import { NoiseTrendChart, IncidentsByDayChart, IncidentsByCategoryChart } from "../components/analytics/Charts";
import { useAsync } from "../hooks/useAsync";
import { analyticsApi } from "../services/analytics";
import { exportsApi } from "../services/exports";
import { useToast } from "../context/ToastContext";
import { ML_CATEGORIES } from "../constants";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom range" }
];

export default function Analytics() {
  const [range, setRange] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { showToast } = useToast();

  const params = range === "custom" ? { from: customFrom, to: customTo } : { range };
  const key = JSON.stringify(params);

  const overview = useAsync(() => analyticsApi.overview(params), [key]);
  const incidentsBreakdown = useAsync(() => analyticsApi.incidents(params), [key]);
  const trends = useAsync(() => analyticsApi.noiseTrends(params), [key]);

  return (
    <div className="page active">
      <Topbar title="Analytics" subtitle="Historical noise data across all tables">
        <Select value={range} onChange={setRange} options={RANGES} />
        <button className="btn" onClick={() => exportsApi.readings(params).catch(() => showToast("Export failed", "error"))}>
          <i className="ti ti-download" /> Export
        </button>
      </Topbar>

      {range === "custom" && (
        <div className="form-row analytics-range-row">
          <input className="form-input" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <input className="form-input" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
        </div>
      )}

      <AsyncSection loading={overview.loading} error={overview.error} data={overview.data} onRetry={overview.reload}>
        {data => (
          <div className="metrics-grid">
            <MetricCard label="Total incidents" value={data.total_incidents ?? "--"} icon="ti-list" iconClass="ico-a" />
            <MetricCard label="Most affected table" value={data.most_affected_table ?? "--"} icon="ti-table" iconClass="ico-r" />
            <MetricCard label="Peak noise day" value={data.peak_day ?? "--"} icon="ti-calendar" iconClass="ico-b" />
            <MetricCard label="Avg daily noise" value={data.avg_daily_db != null ? Number(data.avg_daily_db).toFixed(1) : "--"} unit="dB" icon="ti-chart-bar" iconClass="ico-g" />
          </div>
        )}
      </AsyncSection>

      <div className="analytics-grid">
        <div className="panel">
          <div className="panel-hd">
            <div className="panel-title">Incidents by day</div>
          </div>
          <AsyncSection loading={incidentsBreakdown.loading} error={incidentsBreakdown.error} data={incidentsBreakdown.data} onRetry={incidentsBreakdown.reload}>
            {data => <IncidentsByDayChart labels={data.day_labels ?? []} counts={data.day_counts ?? []} />}
          </AsyncSection>
        </div>
        <div className="panel">
          <div className="panel-hd">
            <div className="panel-title">Incidents by category</div>
          </div>
          <AsyncSection loading={incidentsBreakdown.loading} error={incidentsBreakdown.error} data={incidentsBreakdown.data} onRetry={incidentsBreakdown.reload}>
            {data => <IncidentsByCategoryChart categories={ML_CATEGORIES} counts={data.category_counts ?? []} />}
          </AsyncSection>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd">
          <div className="panel-title">Noise trends per table</div>
        </div>
        <AsyncSection loading={trends.loading} error={trends.error} data={trends.data} onRetry={trends.reload}>
          {data => <NoiseTrendChart labels={data.labels ?? []} series={data.series ?? []} />}
        </AsyncSection>
      </div>
    </div>
  );
}
