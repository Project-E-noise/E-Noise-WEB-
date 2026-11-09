import * as incidentsModel from "../models/incidentsModel.js";
import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import { ML_CATEGORIES } from "../data/constants.js";
import * as check from "../utils/validate.js";

const SERIES_COLORS = ["#0F6E56", "#185FA5", "#A32D2D", "#7F77DD", "#BA7517", "#5DCAA5", "#378ADD"];

// All analytics accept range=today|7d|30d or from/to, plus tz (the
// viewer's timezone) so days and hours line up with local time.
function timeWindow(query = {}) {
  return { ...check.dateRange(query), tz: check.timezone(query.tz) };
}

export async function overview(query) {
  const w = timeWindow(query);
  const [total_incidents, mostAffected, daily, avg_db] = await Promise.all([
    incidentsModel.totalCount(w),
    incidentsModel.mostAffectedTable(w),
    incidentsModel.dailyBreakdown(w),
    noiseReadingsModel.averageDb(w)
  ]);
  const peak = daily.reduce((best, d) => (!best || d.count > best.count ? d : best), null);

  return {
    total_incidents,
    most_affected_table: mostAffected ? `Table ${mostAffected.table_number}` : null,
    peak_day: peak ? peak.day : null,
    avg_daily_db: avg_db
  };
}

export async function incidentsBreakdown(query) {
  const w = timeWindow(query);
  const [daily, categoryRows] = await Promise.all([incidentsModel.dailyBreakdown(w), incidentsModel.categoryBreakdown(w)]);
  const byCategory = Object.fromEntries(categoryRows.map(r => [r.category, r.count]));
  return {
    day_labels: daily.map(d => d.day),
    day_counts: daily.map(d => d.count),
    category_counts: ML_CATEGORIES.map(cat => byCategory[cat] || 0)
  };
}

export async function noiseTrends(query) {
  const w = timeWindow(query);
  // More than 3 days of data: one point per day per table instead of per hour.
  const spanMs = (w.to ? new Date(w.to).getTime() : Date.now()) - (w.from ? new Date(w.from).getTime() : 0);
  const bucket = spanMs > 3 * 24 * 60 * 60 * 1000 ? "day" : "hour";

  const [rows, tables] = await Promise.all([noiseReadingsModel.trendAverages({ ...w, bucket }), tablesModel.findAll()]);
  const labels = [...new Set(rows.map(r => r.bucket))].sort();

  // Look-up table: "tableId|bucket" -> average dB.
  const values = new Map(rows.map(r => [`${r.table_id}|${r.bucket}`, r.avg_db]));
  const series = tables.map((table, index) => ({
    label: `Table ${table.table_number}`,
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    values: labels.map(label => values.get(`${table.id}|${label}`) ?? null)
  }));

  return { bucket, labels, series };
}
