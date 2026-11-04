import * as occupantsModel from "../models/occupantsModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import * as violationsModel from "../models/violationsModel.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";

async function serializeOccupant(occupant) {
  const assignment = await tableAssignmentsModel.activeForOccupant(occupant.id);
  const table = assignment ? await tablesModel.findById(assignment.table_id) : null;
  const violation_count = await occupantsModel.violationCount(occupant.id);
  return {
    ...occupant,
    table: table ? { id: table.id, table_number: table.table_number } : null,
    violation_count
  };
}

export async function listOccupants({ q } = {}) {
  const occupants = await occupantsModel.findAll({ q });
  return Promise.all(occupants.map(serializeOccupant));
}

export async function getOccupant(id) {
  const occupant = await occupantsModel.findById(Number(id));
  if (!occupant) throw notFound("Occupant not found.");
  return serializeOccupant(occupant);
}

export async function createOccupant({ full_name }) {
  if (!full_name || !full_name.trim()) throw badRequest("full_name is required.");
  const occupant = await occupantsModel.create({ full_name: full_name.trim() });
  return serializeOccupant(occupant);
}

export async function updateOccupant(id, payload) {
  const occupant = await occupantsModel.findById(Number(id));
  if (!occupant) throw notFound("Occupant not found.");
  const updated = await occupantsModel.update(occupant.id, {
    full_name: payload.full_name !== undefined ? payload.full_name.trim() : undefined,
    status: payload.status !== undefined ? payload.status : undefined
  });
  return serializeOccupant(updated);
}

export async function deleteOccupant(id) {
  const removed = await occupantsModel.remove(Number(id));
  if (!removed) throw notFound("Occupant not found.");
}

export async function assignOccupant(occupantId, tableId) {
  const occupant = await occupantsModel.findById(Number(occupantId));
  if (!occupant) throw notFound("Occupant not found.");
  if (occupant.status === "BANNED") throw conflict("This occupant is currently banned and cannot be assigned to a table.");

  const table = await tablesModel.findById(Number(tableId));
  if (!table) throw notFound("Table not found.");
  if (await tableAssignmentsModel.activeForTable(table.id)) throw conflict("That table already has an assigned occupant.");
  if (await tableAssignmentsModel.activeForOccupant(occupant.id)) throw conflict("That occupant is already assigned to a table.");

  await tableAssignmentsModel.create({ table_id: table.id, occupant_id: occupant.id });
  return serializeOccupant(occupant);
}

export async function releaseOccupant(occupantId) {
  const occupant = await occupantsModel.findById(Number(occupantId));
  if (!occupant) throw notFound("Occupant not found.");
  const assignment = await tableAssignmentsModel.activeForOccupant(occupant.id);
  if (!assignment) throw conflict("That occupant is not currently assigned to a table.");
  await tableAssignmentsModel.release(assignment.id);
  return serializeOccupant(occupant);
}

export async function occupantViolations(occupantId) {
  const occupant = await occupantsModel.findById(Number(occupantId));
  if (!occupant) throw notFound("Occupant not found.");
  return violationsModel.forOccupant(occupant.id);
}
