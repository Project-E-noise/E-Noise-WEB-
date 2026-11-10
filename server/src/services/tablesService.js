import * as tablesModel from "../models/tablesModel.js";
import * as sensorStatusModel from "../models/sensorStatusModel.js";
import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import * as occupantsModel from "../models/occupantsModel.js";
import * as incidentsModel from "../models/incidentsModel.js";
import { TABLE_STATUSES } from "../data/constants.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import * as check from "../utils/validate.js";
import { computeLedCounts, computeStatus } from "../utils/ledLogic.js";
import { serializeIncident } from "./incidentsService.js";

// Node ids become part of MQTT topic names, so only safe characters are allowed.
const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

async function currentOccupant(tableId) {
  const assignment = await tableAssignmentsModel.activeForTable(tableId);
  if (!assignment) return null;
  const occupant = await occupantsModel.findById(assignment.occupant_id);
  return occupant ? { id: occupant.id, full_name: occupant.full_name, status: occupant.status } : null;
}

/** Full table state for the dashboard: config + live reading + LEDs + occupant. */
export async function serializeTable(table) {
  const [reading, stats, sensorStatus, occupant, lastIncidentAt] = await Promise.all([
    noiseReadingsModel.latestForTable(table.id),
    noiseReadingsModel.statsForTable(table.id),
    sensorStatusModel.findByTableId(table.id),
    currentOccupant(table.id),
    incidentsModel.lastForTable(table.id)
  ]);
  const violationCount = occupant ? await occupantsModel.violationCount(occupant.id) : 0;

  // Prefer the live value from MQTT (sensor_status); fall back to the latest
  // stored reading so a table still shows something before the first message.
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
    // configured_status is the admin setting (AVAILABLE/PAUSED/...);
    // status is the live noise level (SAFE/WARNING/CRITICAL).
    configured_status: table.status,
    status: computeStatus(dbLevel, table),
    // Online = the node said so AND reported recently (sensorStatusModel).
    is_online: sensorStatus?.effective_online ?? false,
    // A loud streak is being timed but isn't confirmed yet.
    is_monitoring: Boolean(sensorStatus?.monitoring_since) && !sensorStatus?.led_critical,
    sensor_status: sensorStatus ? { is_online: sensorStatus.effective_online, last_seen: sensorStatus.last_seen } : null,
    current_db: dbLevel,
    avg_db: stats.avg_db,
    peak_db: stats.peak_db,
    classification,
    confidence,
    // Green/yellow/red follow the reading; the critical bulb only turns on
    // after the confirmation engine (telemetryService) confirms it.
    led_state: { ...computeLedCounts(dbLevel, table), critical: sensorStatus?.led_critical ?? false },
    occupant,
    violation_count: violationCount,
    last_incident_at: lastIncidentAt,
    created_at: table.created_at,
    updated_at: table.updated_at
  };
}

async function findOrFail(id) {
  const table = await tablesModel.findById(check.id(id, "Table id"));
  if (!table) throw notFound("Table not found.");
  return table;
}

// Reads and checks table fields. `current` holds the values to keep for
// fields that were not sent (when editing).
function readTableFields(body, current) {
  const pick = field => (body[field] !== undefined ? body[field] : current[field]);
  const sensorNodeId = check.text(String(pick("sensor_node_id") ?? ""), "Sensor node ID", { max: 100 });
  if (!NODE_ID_PATTERN.test(sensorNodeId)) throw badRequest("Sensor node ID can only use letters, numbers, - and _ (e.g. NODE-008).");

  const fields = {
    table_number: check.number(pick("table_number"), "Table number", { min: 1, max: 9999, integer: true }),
    sensor_node_id: sensorNodeId,
    description: check.optionalText(pick("description"), "Description", { max: 500 }),
    status: check.oneOf(pick("status"), "Status", TABLE_STATUSES),
    warning_threshold: check.number(pick("warning_threshold"), "Warning threshold", { min: 0, max: 150 }),
    critical_threshold: check.number(pick("critical_threshold"), "Critical threshold", { min: 0, max: 150 }),
    confirmation_seconds: check.number(pick("confirmation_seconds"), "Confirmation duration", { min: 0, max: 3600, integer: true })
  };
  if (fields.warning_threshold >= fields.critical_threshold) throw badRequest("Warning threshold must be less than the critical threshold.");
  return fields;
}

async function assertNoDuplicate({ table_number, sensor_node_id, excludeId }) {
  const clash = await tablesModel.findClash({ table_number, sensor_node_id, excludeId });
  if (clash) throw conflict(Number(clash.table_number) === Number(table_number) ? "That table number is already in use." : "That sensor node ID is already in use.");
}

export async function listTables() {
  const tables = await tablesModel.findAll();
  return Promise.all(tables.map(serializeTable));
}

export async function getTable(id) {
  return serializeTable(await findOrFail(id));
}

const NEW_TABLE_DEFAULTS = { description: "", status: "AVAILABLE", warning_threshold: 50, critical_threshold: 60, confirmation_seconds: 10 };

export async function createTable(body = {}) {
  if (body.table_number === undefined || body.table_number === "") throw badRequest("Table number is required.");
  const fields = readTableFields(body, NEW_TABLE_DEFAULTS);
  await assertNoDuplicate(fields);

  const table = await tablesModel.create(fields);
  await sensorStatusModel.createForTable(table.id);
  return serializeTable(table);
}

export async function updateTable(id, body = {}) {
  const table = await findOrFail(id);
  const fields = readTableFields(body, table);
  await assertNoDuplicate({ ...fields, excludeId: table.id });
  return serializeTable(await tablesModel.update(table.id, fields));
}

export async function deleteTable(id) {
  const removed = await tablesModel.remove(check.id(id, "Table id"));
  if (!removed) throw notFound("Table not found.");
}

export async function tableReadings(id, query = {}) {
  const table = await findOrFail(id);
  const group = query.group === undefined ? undefined : check.oneOf(query.group, "group", ["minute", "hour"]);
  const { limit } = check.paging(query, { defaultLimit: 5000, maxLimit: 10000 });
  return noiseReadingsModel.forTable(table.id, { ...check.dateRange(query), group, limit });
}

export async function tableIncidents(id) {
  const table = await findOrFail(id);
  return (await incidentsModel.forTable(table.id)).map(serializeIncident);
}
