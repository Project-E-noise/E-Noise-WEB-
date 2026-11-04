import { useMemo } from "react";
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend);

const axisFont = { family: "'DM Mono', monospace", size: 11 };

export function NoiseTrendChart({ labels, series }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: series.map(s => ({
        label: s.label,
        data: s.values,
        borderColor: s.color,
        backgroundColor: "transparent",
        tension: 0.4,
        pointRadius: 2,
        borderWidth: 2,
        pointBackgroundColor: s.color
      }))
    }),
    [labels, series]
  );
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
    scales: {
      x: { ticks: { color: "#9A9891", font: axisFont, maxRotation: 0 }, grid: { color: "rgba(0,0,0,0.05)" } },
      y: { ticks: { color: "#9A9891", font: axisFont, callback: v => `${v} dB` }, grid: { color: "rgba(0,0,0,0.05)" } }
    }
  };
  return (
    <div className="chart-box analytics">
      <Line data={data} options={options} />
    </div>
  );
}

export function IncidentsByDayChart({ labels, counts }) {
  const data = useMemo(() => ({ labels, datasets: [{ data: counts, backgroundColor: "#1D9E75", borderRadius: 4, borderSkipped: false }] }), [labels, counts]);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#9A9891", font: axisFont, maxRotation: 30 }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: "#9A9891", font: axisFont, stepSize: 2 }, grid: { color: "rgba(0,0,0,0.05)" } }
    }
  };
  return (
    <div className="chart-box analytics">
      <Bar data={data} options={options} />
    </div>
  );
}

const CATEGORY_COLORS = ["var(--r400)", "var(--a400)", "var(--b400)", "var(--pu400)"];

export function IncidentsByCategoryChart({ categories, counts }) {
  const data = useMemo(
    () => ({ datasets: [{ data: counts, backgroundColor: ["#E24B4A", "#EF9F27", "#378ADD", "#7F77DD"], borderWidth: 0, hoverOffset: 4 }] }),
    [counts]
  );
  return (
    <div className="donut-wrap">
      <Doughnut data={data} options={{ responsive: false, plugins: { legend: { display: false } }, cutout: "68%" }} className="donut-canvas" />
      <div className="donut-legend">
        {categories.map((label, i) => (
          <div className="donut-item" key={label}>
            <div className="donut-sq" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} /> {label} <strong>{counts[i] ?? 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
