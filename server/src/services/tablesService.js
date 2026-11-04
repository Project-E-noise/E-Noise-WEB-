import * as tablesModel from "../models/tablesModel.js";
import * as sensorStatusModel from "../models/sensorStatusModel.js";
import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import * as occupantsModel from "../models/occupantsModel.js";
import * as incidentsModel from "../models/incidentsModel.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import { computeLedCounts, computeStatus } from "../utils/ledLogic.js";

// Combines the stateless per-reading green/yellow/red counts with the
// backend-confirmed critical flag (Phase 5: set only by telemetryService's
// duration-confirmation engine, never by this instantaneous calculation —
// see the spec's "critical LED rule").
function ledStateFor(dbLevel, table, sensorStatus) {
  const counts = computeLedCounts(dbLevel, table);
  return { ...counts, critical: sensorStatus?.led_critical ?? false };
}

async function currentOccupant(tableId) {
  const assignment = await tableAssignmentsModel.activeForTable(tableId);
  if (!assignment) return null;
  const occupant = await occupantsModel.findById(assignment.occupant_id);
  return occupant ? { id: occupant.id, full_name: occupant.full_name, status: occupant.status } : null;
}

async function violationCount(tableId) {
  const occupant = await currentOccupant(tableId);
  if (!occupant) return 0;
  return occupantsModel.violationCount(occupant.id);
}

export async function serializeTable(table) {
  const [reading, stats, sensorStatus, occupant, lastIncidentAt, violCount] = await Promise.all([
    noiseReadingsModel.latestForTable(table.id),
    noiseReadingsModel.statsForTable(table.id),
    sensorStatusModel.findByTableId(table.id),
    currentOccupant(table.id),
    incidentsModel.lastForTable(table.id),
    violationCount(table.id)
  ]);
  // Prefer the live value MQTT ingestion wrote to sensor_status (updated on
  // every telemetry message); fall back to the latest noise_readings row so
  // a table still renders sensibly before the first live message arrives.
  const dbLevel = sensorStatus?.current_db != null ? Number(sensorStatus.current_db) : reading?.db_level != null ? Number(reading.db_level) : null;
  const classification = sensorStatus?.classification ?? reading?.classification ?? null;
  const confidence = sensorStatus?.confidence != null ? Number(sensorStatus.confidence) : reading?.confidence != null ? Number(reading.confidence) : null;

  return {
    id: table.id,
    table_number: table.table_number,
    sensor_node_id: table.sensor_node_id,
    description: table.description,
    warning_threshold: Number(table.warning_threshold),
    critical_threshold: Number(table.critical_threshold),
    confirmation_seconds: table.confirmation_seconds,
    status: computeStatus(dbLevel, table),
    is_online: sensorStatus?.is_online ?? false,
    // is_monitoring: an above-critical streak is in progress but hasn't yet
    // been sustained for confirmation_seconds — the critical bulb is still
    // off, but the dashboard can show a "confirming..." state instead of
    // just SAFE/WARNING while it waits.
    is_monitoring: Boolean(sensorStatus?.monitoring_since) && !sensorStatus?.led_critical,
    sensor_status: sensorStatus ? { is_online: sensorStatus.is_online, last_seen: sensorStatus.last_seen } : null,
    current_db: dbLevel,
    avg_db: stats.avg_db,
    peak_db: stats.peak_db,
    classification,
    confidence,
    led_state: ledStateFor(dbLevel, table, sensorStatus),
    occupant,
    violation_count: violCount,
    last_incident_at: lastIncidentAt,
    created_at: table.created_at,
    updated_at: table.updated_at
  };
}

export async function listTables() {
  const tables = await tablesModel.findAll();
  return Promise.all(tables.map(serializeTable));
}

export async function getTable(id) {
  const table = await tablesModel.findById(Number(id));
  if (!table) throw notFound("Table not found.");
  return serializeTable(table);
}

async function assertNoDuplicate({ table_number, sensor_node_id, excludeId }) {
  const clash = await tablesModel.findClash({ table_number, sensor_node_id, excludeId });
  if (clash) throw conflict(String(clash.table_number) === String(table_number) ? "That table number is already in use." : "That sensor node ID is already in use.");
}

export async function createTable(payload) {
  const { table_number, sensor_node_id, description = "", status = "AVAILABLE", warning_threshold = 50, critical_threshold = 60, confirmation_seconds = 10 } = payload;
  if (!table_number || !sensor_node_id) throw badRequest("table_number and sensor_node_id are required.");
  if (Number(warning_threshold) >= Number(critical_threshold)) throw badRequest("warning_threshold must be less than critical_threshold.");
  await assertNoDuplicate({ table_number, sensor_node_id });

  const table = await tablesModel.create({
    table_number,
    sensor_node_id,
    description,
    status,
    warning_threshold: Number(warning_threshold),
    critical_threshold: Number(critical_threshold),
    confirmation_seconds: Number(confirmation_seconds)
  });
  await sensorStatusModel.createForTable(table.id);
  return serializeTable(table);
}

export async function updateTable(id, payload) {
  const table = await tablesModel.findById(Number(id));
  if (!table) throw notFound("Table not found.");

  const next = { ...table, ...payload };
  if (Number(next.warning_threshold) >= Number(next.critical_threshold)) throw badRequest("warning_threshold must be less than critical_threshold.");
  if (Number(next.confirmation_seconds) < 0) throw badRequest("confirmation_seconds must be 0 or greater.");
  await assertNoDuplicate({ table_number: next.table_number, sensor_node_id: next.sensor_node_id, excludeId: table.id });

  const updated = await tablesModel.update(table.id, {
    table_number: next.table_number,
    sensor_node_id: next.sensor_node_id,
    description: next.description,
    status: next.status,
    warning_threshold: Number(next.warning_threshold),
    critical_threshold: Number(next.critical_threshold),
    confirmation_seconds: Number(next.confirmation_seconds)
  });
  return serializeTable(updated);
}

export async function deleteTable(id) {
  const removed = await tablesModel.remove(Number(id));
  if (!removed) throw notFound("Table not found.");
}

export async function tableReadings(id, { from, to } = {}) {
  const tableId = Number(id);
  const table = await tablesModel.findById(tableId);
  if (!table) throw notFound("Table not found.");
  return noiseReadingsModel.forTable(tableId, { from, to });
}

export async function tableIncidents(id) {
  const tableId = Number(id);
  const table = await tablesModel.findById(tableId);
  if (!table) throw notFound("Table not found.");
  return incidentsModel.forTable(tableId);
}
