import { useMemo } from "react";
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend);

// Chart.js can't read CSS variables, so these copy the values in styles.css.
const AXIS = { color: "#8a8f89", font: { family: "'DM Mono', monospace", size: 11 } };
const GRID = "rgba(0,0,0,0.05)";
// Loud Conversation, Mobile Phone Noise, Impact Noise, Ambient Baseline
export const CATEGORY_COLORS = ["#e24b4a", "#ef9f27", "#378add", "#6a5fd0"];

export function NoiseTrendChart({ labels, series, height = "" }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: series.map(s => ({
        label: s.label,
        data: s.values,
        borderColor: s.color,
        backgroundColor: s.color,
        tension: 0.35,
        pointRadius: labels.length > 60 ? 0 : 2,
        borderWidth: 2,
        spanGaps: true
      }))
    }),
    [labels, series]
  );
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: series.length > 1, position: "bottom", labels: { boxWidth: 10, font: AXIS.font } } },
    scales: {
      x: { ticks: { ...AXIS, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: GRID } },
      y: { ticks: { ...AXIS, callback: v => `${v} dB` }, grid: { color: GRID } }
    }
  };
  return (
    <div className={`chart-box ${height}`}>
      <Line data={data} options={options} aria-label="Noise trend chart" role="img" />
    </div>
  );
}

export function IncidentsByDayChart({ labels, counts }) {
  const data = useMemo(() => ({ labels, datasets: [{ label: "Incidents", data: counts, backgroundColor: "#1d9e75", borderRadius: 4 }] }), [labels, counts]);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { ...AXIS, maxRotation: 0, autoSkip: true }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { ...AXIS, precision: 0 }, grid: { color: GRID } }
    }
  };
  return (
    <div className="chart-box">
      <Bar data={data} options={options} aria-label="Incidents per day chart" role="img" />
    </div>
  );
}

export function IncidentsByCategoryChart({ categories, counts }) {
  const data = useMemo(
    () => ({ labels: categories, datasets: [{ data: counts, backgroundColor: CATEGORY_COLORS, borderWidth: 0, hoverOffset: 4 }] }),
    [categories, counts]
  );
  return (
    <div className="donut-wrap">
      <Doughnut data={data} options={{ responsive: false, plugins: { legend: { display: false } }, cutout: "68%" }} className="donut-canvas" aria-label="Incidents by category chart" role="img" />
      <div className="donut-legend">
        {categories.map((label, i) => (
          <div className="donut-item" key={label}>
            <span className="donut-sq" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} /> {label} <strong>{counts[i] ?? 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
