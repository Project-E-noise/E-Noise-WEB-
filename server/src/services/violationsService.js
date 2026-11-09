import * as violationsModel from "../models/violationsModel.js";
import * as occupantsModel from "../models/occupantsModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import { BAN_VIOLATION_THRESHOLD } from "../data/constants.js";

const BAN_DURATION_DAYS = 7; // one week

/**
 * Ban rule (the backend decides; the frontend only shows the result):
 * - Every CONFIRMED incident linked to an occupant creates one violation.
 * - Strikes = violations since the occupant's last ban started (or ever).
 * - On the 3rd strike the occupant is banned for one week, released from
 *   their table, and their strikes start again from 0.
 * - A ban ends by itself at ban_until.
 *
 * Must run inside the same transaction as the incident insert (`client`),
 * so the incident, violation and ban are saved together or not at all.
 */
export async function recordViolationIfApplicable(incident, client) {
  if (incident.status !== "CONFIRMED" || !incident.occupant_id) return null;
  if (await violationsModel.findByIncident(incident.id, client)) return null;

  // Lock the occupant row so two incidents at the same moment can't both
  // read "2 strikes" and miss the ban.
  const occupant = await occupantsModel.findByIdForUpdate(incident.occupant_id, client);
  if (!occupant) return null;

  const violation = await violationsModel.create(
    {
      occupant_id: occupant.id,
      incident_id: incident.id,
      table_id: incident.table_id,
      violation_number: await violationsModel.nextNumber(occupant.id, client)
    },
    client
  );

  // Already serving a ban: record the violation, but don't stack bans.
  if (occupant.status === "BANNED") return violation;

  const strikes = await violationsModel.countStrikes(occupant.id, client);
  if (strikes >= BAN_VIOLATION_THRESHOLD) {
    await occupantsModel.ban(occupant.id, BAN_DURATION_DAYS, client);
    await tableAssignmentsModel.releaseForOccupant(occupant.id, client);
  }
  return violation;
}

/** Called when an admin changes an incident away from CONFIRMED. */
export async function removeViolationForIncident(incidentId, client) {
  return violationsModel.removeForIncident(incidentId, client);
}

/** Current strike count (0-3) for an occupant. */
export async function currentStrikes(occupant) {
  if (!occupant || occupant.status === "BANNED") return occupant ? BAN_VIOLATION_THRESHOLD : 0;
  return Math.min(await violationsModel.countStrikes(occupant.id), BAN_VIOLATION_THRESHOLD);
}
