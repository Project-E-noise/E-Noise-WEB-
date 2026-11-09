import { useMemo, useState } from "react";
import { Topbar } from "../components/layout/Topbar";
import { MetricCard } from "../components/dashboard/MetricCard";
import { Select } from "../components/common/FormFields";
import { DateRangeFilter } from "../components/common/DateRangeFilter";
import { AsyncSection } from "../components/common/UiStates";
import { NoiseTrendChart, IncidentsByDayChart, IncidentsByCategoryChart } from "../components/analytics/Charts";
import { useAsync } from "../hooks/useAsync";
import { analyticsApi } from "../services/analytics";
import { exportsApi } from "../services/exports";
import { useToast } from "../context/ToastContext";
import { ML_CATEGORIES } from "../constants";
import { rangeParams, viewerTimezone } from "../utils/dates";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" }
];

export default function Analytics() {
  const [range, setRange] = useState("7d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const { showToast } = useToast();

  const params = useMemo(() => ({ ...rangeParams(range, custom), tz: viewerTimezone() }), [range, custom]);
  const key = JSON.stringify(params);

  const overview = useAsync(() => analyticsApi.overview(params), [key]);
  const breakdown = useAsync(() => analyticsApi.incidents(params), [key]);
  const trends = useAsync(() => analyticsApi.noiseTrends(params), [key]);

  const exportReadings = () => exportsApi.readings({ from: params.from, to: params.to }).catch(err => showToast(err.message || "Export failed", "error"));

  return (
    <div className="page">
      <Topbar title="Analytics" subtitle="Noise and incidents over time">
        <Select label="Period" value={range} onChange={setRange} options={RANGES} />
        <button type="button" className="btn" onClick={exportReadings}><i className="ti ti-download" /> Export readings</button>
      </Topbar>

      {range === "custom" && (
        <div className="card">
          <DateRangeFilter value={custom} onApply={setCustom} />
        </div>
      )}

      <AsyncSection loading={overview.loading} error={overview.error} data={overview.data} onRetry={overview.reload} loadingLabel="Loading summary...">
        {data => (
          <div className="metrics-grid">
            <MetricCard label="Total incidents" value={data.total_incidents} icon="ti-list" iconClass="ico-a" />
            <MetricCard label="Most affected table" value={data.most_affected_table ?? "--"} icon="ti-table" iconClass="ico-r" />
            <MetricCard label="Busiest day" value={data.peak_day ?? "--"} icon="ti-calendar" iconClass="ico-b" />
            <MetricCard label="Average noise" value={data.avg_daily_db != null ? Number(data.avg_daily_db).toFixed(1) : "--"} unit="dB" icon="ti-chart-bar" iconClass="ico-g" />
          </div>
        )}
      </AsyncSection>

      <div className="two-grid">
        <section className="card">
          <div className="card-header"><h2 className="card-title">Incidents by day</h2></div>
          <AsyncSection
            loading={breakdown.loading}
            error={breakdown.error}
            data={breakdown.data}
            isEmpty={d => !d.day_counts?.length}
            onRetry={breakdown.reload}
            emptyProps={{ icon: "ti-chart-bar", title: "No incidents in this period" }}
          >
            {data => <IncidentsByDayChart labels={data.day_labels} counts={data.day_counts} />}
          </AsyncSection>
        </section>
        <section className="card">
          <div className="card-header"><h2 className="card-title">Incidents by category</h2></div>
          <AsyncSection
            loading={breakdown.loading}
            error={breakdown.error}
            data={breakdown.data}
            isEmpty={d => !d.category_counts?.some(Boolean)}
            onRetry={breakdown.reload}
            emptyProps={{ icon: "ti-chart-donut", title: "No incidents in this period" }}
          >
            {data => <IncidentsByCategoryChart categories={ML_CATEGORIES} counts={data.category_counts} />}
          </AsyncSection>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Average noise per table</h2>
          {trends.data && <span className="badge badge-neu">{trends.data.bucket === "day" ? "Daily averages" : "Hourly averages"}</span>}
        </div>
        <AsyncSection
          loading={trends.loading}
          error={trends.error}
          data={trends.data}
          isEmpty={d => !d.labels?.length}
          onRetry={trends.reload}
          emptyProps={{ icon: "ti-chart-line", title: "No readings in this period" }}
        >
          {data => <NoiseTrendChart height="tall" labels={data.labels.map(l => (data.bucket === "day" ? l : l.slice(5)))} series={data.series} />}
        </AsyncSection>
      </section>
    </div>
  );
}
