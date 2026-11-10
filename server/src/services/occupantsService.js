import * as occupantsModel from "../models/occupantsModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import * as tablesModel from "../models/tablesModel.js";
import * as violationsModel from "../models/violationsModel.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import * as check from "../utils/validate.js";
import { currentStrikes } from "./violationsService.js";

async function serializeOccupant(occupant) {
  const assignment = await tableAssignmentsModel.activeForOccupant(occupant.id);
  const table = assignment ? await tablesModel.findById(assignment.table_id) : null;
  const [violation_count, strikes] = await Promise.all([occupantsModel.violationCount(occupant.id), currentStrikes(occupant)]);
  return {
    id: occupant.id,
    full_name: occupant.full_name,
    email: occupant.email,
    contact: occupant.contact,
    // False until the occupant verified their email and set a password.
    account_ready: Boolean(occupant.account_ready),
    // When they agreed to the privacy notice at registration (null = not recorded).
    consented_at: occupant.consented_at,
    status: occupant.status,
    ban_started_at: occupant.ban_started_at,
    // Only show the ban end date while the ban is active.
    ban_until: occupant.status === "BANNED" ? occupant.ban_until : null,
    created_at: occupant.created_at,
    updated_at: occupant.updated_at,
    table: table ? { id: table.id, table_number: table.table_number } : null,
    violation_count,
    strikes
  };
}

async function findOrFail(id) {
  const occupant = await occupantsModel.findById(check.id(id, "Occupant id"));
  if (!occupant) throw notFound("Occupant not found.");
  return occupant;
}

export async function listOccupants(query = {}) {
  const q = check.optionalText(query.q, "Search", { max: 100 });
  const occupants = await occupantsModel.findAll({ q });
  return Promise.all(occupants.map(serializeOccupant));
}

export async function getOccupant(id) {
  return serializeOccupant(await findOrFail(id));
}

// There is no createOccupant: occupants sign up themselves on the client
// portal (/client/register), so every new occupant has an email.

export async function updateOccupant(id, body = {}) {
  const occupant = await findOrFail(id);
  const full_name = body.full_name === undefined ? undefined : check.text(body.full_name, "Full name", { max: 100 });
  const contact = body.contact === undefined ? undefined : check.optionalText(body.contact, "Contact", { max: 100 });

  // The email is the occupant's login; only they can change it.
  if (body.email !== undefined && String(body.email ?? "").trim().toLowerCase() !== String(occupant.email ?? "").toLowerCase()) {
    throw badRequest("An occupant's email can't be changed by an admin.");
  }

  // Bans are set automatically by the 3-violation rule. An admin can only end one early.
  if (body.status !== undefined) {
    check.oneOf(body.status, "Status", ["ACTIVE"]);
    if (occupant.status === "BANNED") await occupantsModel.liftBan(occupant.id);
  }

  const updated = await occupantsModel.update(occupant.id, { full_name, contact });
  return serializeOccupant(updated);
}

export async function deleteOccupant(id) {
  const removed = await occupantsModel.remove(check.id(id, "Occupant id"));
  if (!removed) throw notFound("Occupant not found.");
}

export async function assignOccupant(occupantId, tableId) {
  const occupant = await findOrFail(occupantId);
  if (tableId === undefined || tableId === null || tableId === "") throw badRequest("Choose a table.");
  const table = await tablesModel.findById(check.id(tableId, "Table id"));
  if (!table) throw notFound("Table not found.");

  if (!occupant.account_ready) throw conflict("This occupant hasn't finished setting up their account.");
  if (occupant.status === "BANNED") throw conflict("This occupant is currently banned and cannot be assigned to a table.");
  if (await tableAssignmentsModel.activeForTable(table.id)) throw conflict("That table already has an assigned occupant.");
  if (await tableAssignmentsModel.activeForOccupant(occupant.id)) throw conflict("That occupant is already assigned to a table.");

  await tableAssignmentsModel.create({ table_id: table.id, occupant_id: occupant.id });
  return serializeOccupant(occupant);
}

export async function releaseOccupant(occupantId) {
  const occupant = await findOrFail(occupantId);
  const assignment = await tableAssignmentsModel.activeForOccupant(occupant.id);
  if (!assignment) throw conflict("That occupant is not currently assigned to a table.");
  await tableAssignmentsModel.release(assignment.id);
  return serializeOccupant(occupant);
}

export async function occupantViolations(occupantId) {
  const occupant = await findOrFail(occupantId);
  return violationsModel.forOccupant(occupant.id);
}
