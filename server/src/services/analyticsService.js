import * as incidentsModel from "../models/incidentsModel.js";
import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import { ML_CATEGORIES } from "../data/constants.js";

function rangeBounds({ range, from, to } = {}) {
  if (range === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: null };
  }

  if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30;
    return { from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(), to: null };
  }

  const start = from ? new Date(`${from}T00:00:00`) : null;
  const end = to ? new Date(`${to}T23:59:59.999`) : null;
  return {
    from: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
    to: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null
  };
}

export async function overview(params) {
  const bounds = rangeBounds(params);
  const [totalIncidents, mostAffected, readings] = await Promise.all([
    incidentsModel.totalCount({ since: bounds.from, to: bounds.to }),
    incidentsModel.mostAffectedTable({ since: bounds.from, to: bounds.to }),
    noiseReadingsModel.findAll(bounds)
  ]);

  let mostAffectedLabel = null;
  if (mostAffected) {
    const table = await tablesModel.findById(mostAffected.table_id);
    mostAffectedLabel = table ? `Table ${table.table_number}` : null;
  }

  const daily = await incidentsModel.dailyBreakdown({ since: bounds.from, to: bounds.to });
  const peakDay = daily.length ? daily.slice().sort((a, b) => b.count - a.count)[0].day : null;

  const avgDb = readings.length ? readings.reduce((sum, r) => sum + Number(r.db_level), 0) / readings.length : null;

  return {
    total_incidents: totalIncidents,
    most_affected_table: mostAffectedLabel,
    peak_day: peakDay,
    avg_daily_db: avgDb
  };
}

export async function incidentsBreakdown(params) {
  const bounds = rangeBounds(params);
  const daily = await incidentsModel.dailyBreakdown({ since: bounds.from, to: bounds.to });
  const day_labels = daily.map(d => d.day);
  const day_counts = daily.map(d => d.count);

  const categoryRows = await incidentsModel.categoryBreakdown({ since: bounds.from, to: bounds.to });
  const byCategory = Object.fromEntries(categoryRows.map(r => [r.category, r.count]));
  const category_counts = ML_CATEGORIES.map(cat => byCategory[cat] || 0);

  return { day_labels, day_counts, category_counts };
}

export async function noiseTrends(params) {
  const bounds = rangeBounds(params);
  const colors = ["#0F6E56", "#185FA5", "#A32D2D", "#7F77DD", "#BA7517", "#5DCAA5", "#378ADD"];
  const [readings, tables] = await Promise.all([noiseReadingsModel.findAll(bounds), tablesModel.findAll()]);

  const timestamps = [...new Set(readings.map(r => r.recorded_at.toISOString()))].sort();
  const labels = timestamps.map(t => new Date(t).toLocaleTimeString(undefined, { hour: "numeric" }));

  const series = tables.map((table, index) => ({
    label: `Table ${table.table_number}`,
    color: colors[index % colors.length],
    values: timestamps.map(ts => {
      const reading = readings.find(r => r.table_id === table.id && r.recorded_at.toISOString() === ts);
      return reading ? Number(reading.db_level) : null;
    })
  }));

  return { labels, series };
}
