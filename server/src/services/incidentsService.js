import * as incidentsModel from "../models/incidentsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import * as occupantsModel from "../models/occupantsModel.js";
import { withTransaction } from "../config/db.js";
import { ML_CATEGORIES, INCIDENT_STATUSES, FILTER_REASONS, VIOLATION_CATEGORIES } from "../data/constants.js";
import { badRequest, notFound } from "../utils/errors.js";
import * as check from "../utils/validate.js";
import { recordViolationIfApplicable, removeViolationForIncident } from "./violationsService.js";

/** API shape for one incident row (from the joined queries in incidentsModel). */
export function serializeIncident(row) {
  return {
    id: row.id,
    table_id: row.table_id,
    occupant_id: row.occupant_id,
    category: row.category,
    db_level: Number(row.db_level),
    confidence: row.confidence != null ? Number(row.confidence) : null,
    peak_db: row.peak_db != null ? Number(row.peak_db) : null,
    top_class: row.top_class ?? null,
    filter_reason: row.filter_reason ?? null,
    duration_seconds: row.duration_seconds,
    bulb_triggered: row.bulb_triggered,
    status: row.status,
    notes: row.notes,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    table: row.table_number != null ? { id: row.table_id, table_number: row.table_number } : null,
    occupant: row.occupant_id ? { id: row.occupant_id, full_name: row.occupant_name } : null
  };
}

// Checks every field that may be sent when creating or editing an incident.
// With partial=true, missing fields are left undefined (= not changed).
// A category is required only for CONFIRMED incidents (filtered ones may
// have no label at all).
function readIncidentFields(body, { partial }) {
  const has = field => body[field] !== undefined;
  const blank = field => body[field] === null || body[field] === "";
  const fields = {};
  if (!partial || has("category")) fields.category = !has("category") || blank("category") ? null : check.oneOf(body.category, "Category", ML_CATEGORIES);
  if (!partial || has("db_level")) fields.db_level = check.number(body.db_level, "dB level", { min: 0, max: 200 });
  if (!partial || has("confidence")) fields.confidence = check.optionalNumber(body.confidence, "Confidence", { min: 0, max: 1 });
  if (!partial || has("duration_seconds")) {
    fields.duration_seconds = check.optionalNumber(body.duration_seconds, "Duration", { min: 0, max: 86400, integer: true });
  }
  if (has("bulb_triggered")) fields.bulb_triggered = check.boolean(body.bulb_triggered, "Bulb triggered");
  else if (!partial) fields.bulb_triggered = false;
  if (has("status")) fields.status = check.oneOf(body.status, "Status", INCIDENT_STATUSES);
  else if (!partial) fields.status = "CONFIRMED";
  if (has("notes")) fields.notes = check.optionalText(body.notes, "Notes", { max: 1000 });
  else if (!partial) fields.notes = "";
  if (has("occurred_at")) fields.occurred_at = check.optionalDateTime(body.occurred_at, "Occurred at") ?? undefined;
  if (has("peak_db")) fields.peak_db = check.optionalNumber(body.peak_db, "Peak dB", { min: 0, max: 200 });
  if (has("top_class")) fields.top_class = check.optionalText(body.top_class, "Top class", { max: 100, fallback: null });
  if (has("filter_reason")) fields.filter_reason = blank("filter_reason") ? null : check.oneOf(body.filter_reason, "Filter reason", FILTER_REASONS);
  if (!partial && fields.status === "CONFIRMED") assertViolationCategory(fields.category);
  return fields;
}

// Only violation sounds can be CONFIRMED (see VIOLATION_CATEGORIES).
function assertViolationCategory(category) {
  if (!category) throw badRequest("Choose a category for a confirmed incident.");
  if (!VIOLATION_CATEGORIES.includes(category)) {
    throw badRequest(`A confirmed violation must be one of: ${VIOLATION_CATEGORIES.join(", ")}.`);
  }
}

export async function listIncidents(query = {}) {
  const rows = await incidentsModel.findAll({
    table_id: check.optionalId(query.table_id, "table_id"),
    ...check.dateRange(query)
  });
  return rows.map(serializeIncident);
}

export async function getIncident(id) {
  const row = await incidentsModel.findById(check.id(id, "Incident id"));
  if (!row) throw notFound("Incident not found.");
  return serializeIncident(row);
}

/**
 * Creates an incident and (inside the same transaction) the occupant's
 * violation and ban if this was their 3rd strike. Used by the REST API and
 * by the telemetry confirmation engine.
 */
export async function createIncident(body = {}, { occupantAt } = {}) {
  const tableId = check.id(body.table_id, "Table");
  const fields = readIncidentFields(body, { partial: false });

  const table = await tablesModel.findById(tableId);
  if (!table) throw notFound("Table not found.");

  // No occupant given: blame whoever sat at the table at `occupantAt` (the
  // confirmation engine passes the streak start), or right now.
  let occupantId = check.optionalId(body.occupant_id, "Occupant");
  if (occupantId) {
    if (!await occupantsModel.findById(occupantId)) throw notFound("Occupant not found.");
  } else if (occupantAt) {
    occupantId = (await tableAssignmentsModel.activeAt(tableId, occupantAt))?.occupant_id ?? null;
  } else {
    occupantId = (await tableAssignmentsModel.activeForTable(tableId))?.occupant_id ?? null;
  }

  const created = await withTransaction(async client => {
    // Lock the occupant first (before the insert) so two incidents for the
    // same person wait for each other instead of deadlocking.
    if (occupantId) await occupantsModel.findByIdForUpdate(occupantId, client);
    const incident = await incidentsModel.create(
      { ...fields, table_id: tableId, occupant_id: occupantId, occurred_at: fields.occurred_at || new Date().toISOString() },
      client
    );
    await recordViolationIfApplicable(incident, client);
    return incident;
  });

  return getIncident(created.id);
}

/**
 * Editing the status also adds or removes the matching violation. Leaving
 * CONFIRMED deletes the violation and recounts the ban; becoming CONFIRMED
 * (e.g. "Confirm as violation" on a filtered incident) needs a violation
 * category and then goes through the normal strike rules.
 */
export async function updateIncident(id, body = {}) {
  const incidentId = check.id(id, "Incident id");
  const existing = await incidentsModel.findById(incidentId);
  if (!existing) throw notFound("Incident not found.");
  const fields = readIncidentFields(body, { partial: true });

  const nextStatus = fields.status ?? existing.status;
  if (nextStatus === "CONFIRMED" && (existing.status !== "CONFIRMED" || fields.category !== undefined)) {
    if (fields.category === null || (!fields.category && !existing.category)) throw badRequest("Choose a category to confirm this incident.");
    assertViolationCategory(fields.category ?? existing.category);
  }

  await withTransaction(async client => {
    if (existing.occupant_id) await occupantsModel.findByIdForUpdate(existing.occupant_id, client);
    const updated = await incidentsModel.update(incidentId, fields, client);
    if (existing.status === "CONFIRMED" && updated.status !== "CONFIRMED") await removeViolationForIncident(incidentId, client);
    if (existing.status !== "CONFIRMED" && updated.status === "CONFIRMED") await recordViolationIfApplicable(updated, client);
  });

  return getIncident(incidentId);
}

/** Deleting a CONFIRMED incident also recounts the occupant's ban. */
export async function deleteIncident(id) {
  const incidentId = check.id(id, "Incident id");
  const existing = await incidentsModel.findById(incidentId);
  if (!existing) throw notFound("Incident not found.");
  await withTransaction(async client => {
    if (existing.occupant_id) await occupantsModel.findByIdForUpdate(existing.occupant_id, client);
    await removeViolationForIncident(incidentId, client);
    await incidentsModel.remove(incidentId, client);
  });
}
