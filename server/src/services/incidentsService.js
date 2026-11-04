import * as incidentsModel from "../models/incidentsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import * as occupantsModel from "../models/occupantsModel.js";
import { withTransaction } from "../config/db.js";
import { badRequest, notFound } from "../utils/errors.js";
import { recordViolationIfApplicable } from "./violationsService.js";

async function serializeIncident(incident) {
  const table = await tablesModel.findById(incident.table_id);
  const occupant = incident.occupant_id ? await occupantsModel.findById(incident.occupant_id) : null;
  return {
    ...incident,
    table: table ? { id: table.id, table_number: table.table_number } : null,
    occupant: occupant ? { id: occupant.id, full_name: occupant.full_name } : null
  };
}

function since(range) {
  const now = Date.now();
  if (range === "today") return new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  if (range === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

export async function listIncidents(params = {}) {
  const incidents = await incidentsModel.findAll({
    table_id: params.table_id ? Number(params.table_id) : null,
    since: since(params.range)
  });
  return Promise.all(incidents.map(serializeIncident));
}

export async function getIncident(id) {
  const incident = await incidentsModel.findById(Number(id));
  if (!incident) throw notFound("Incident not found.");
  return serializeIncident(incident);
}

export async function createIncident(payload) {
  const { table_id, category, db_level, confidence = null, occupant_id = null, duration_seconds = null, bulb_triggered = false, status = "CONFIRMED", notes = "", occurred_at } = payload;
  if (!table_id || !category || db_level == null) throw badRequest("table_id, category, and db_level are required.");

  const table = await tablesModel.findById(Number(table_id));
  if (!table) throw notFound("Table not found.");

  const resolvedOccupantId = occupant_id
    ? Number(occupant_id)
    : (await tableAssignmentsModel.activeForTable(Number(table_id)))?.occupant_id ?? null;

  const incident = await withTransaction(async client => {
    const created = await incidentsModel.create(
      {
        table_id: Number(table_id),
        occupant_id: resolvedOccupantId,
        category,
        db_level: Number(db_level),
        confidence: confidence != null ? Number(confidence) : null,
        duration_seconds: duration_seconds != null ? Number(duration_seconds) : null,
        bulb_triggered: Boolean(bulb_triggered),
        status,
        notes,
        occurred_at: occurred_at ? new Date(occurred_at).toISOString() : new Date().toISOString()
      },
      client
    );
    await recordViolationIfApplicable(created, client);
    return created;
  });

  return serializeIncident(incident);
}

export async function updateIncident(id, payload) {
  const existing = await incidentsModel.findById(Number(id));
  if (!existing) throw notFound("Incident not found.");
  const updated = await incidentsModel.update(existing.id, payload);
  return serializeIncident(updated);
}

export async function deleteIncident(id) {
  const removed = await incidentsModel.remove(Number(id));
  if (!removed) throw notFound("Incident not found.");
}
