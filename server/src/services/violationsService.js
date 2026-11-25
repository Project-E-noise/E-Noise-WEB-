import * as violationsModel from "../models/violationsModel.js";
import * as occupantsModel from "../models/occupantsModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import { env } from "../config/env.js";
import { BAN_VIOLATION_THRESHOLD } from "../data/constants.js";

const BAN_DURATION_DAYS = 7; // one week

// Hours in the rolling window for the daily strike cap.
const STRIKE_CAP_WINDOW_HOURS = 24;

/**
 * Ban rule (the backend decides; the frontend only shows the result):
 * - A CONFIRMED incident linked to an occupant creates one violation,
 *   unless the occupant already got MAX_STRIKES_PER_DAY strikes in the
 *   last 24 h (the incident stays CONFIRMED, it just isn't a new strike).
 *   IGNORED / UNVERIFIED / DISMISSED incidents never create one.
 * - Strikes = violations since the occupant's last ban started (or ever),
 *   inside the last VIOLATION_RETENTION_DAYS days.
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

  // Daily cap: continuous noise can't stack up a 3-strike ban in minutes.
  if (await violationsModel.countRecent(occupant.id, STRIKE_CAP_WINDOW_HOURS, client) >= env.maxStrikesPerDay) return null;

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

  const strikes = await violationsModel.countStrikes(occupant.id, env.violationRetentionDays, client);
  if (strikes >= BAN_VIOLATION_THRESHOLD) {
    await occupantsModel.ban(occupant.id, BAN_DURATION_DAYS, client);
    await tableAssignmentsModel.releaseForOccupant(occupant.id, client);
  }
  return violation;
}

/**
 * Retention: deletes violations older than VIOLATION_RETENTION_DAYS (run
 * daily from server.js), so strikes only cover that period. Bans are stored
 * on the occupant (ban_until), so a running ban is not affected.
 */
export async function cleanupOldViolations(days = env.violationRetentionDays) {
  return violationsModel.deleteOlderThan(days);
}

/**
 * Called (inside the caller's transaction) when an incident stops being
 * CONFIRMED or is deleted: deletes its violation, then recounts the
 * strikes behind the occupant's current ban. Below the threshold the ban is
 * lifted and the remaining strikes count again. Returns the deleted
 * violation, or null.
 */
export async function removeViolationForIncident(incidentId, client) {
  const removed = await violationsModel.removeForIncident(incidentId, client);
  if (!removed) return null;

  const occupant = await occupantsModel.findByIdForUpdate(removed.occupant_id, client);
  if (occupant?.status !== "BANNED") return removed;

  const strikes = await violationsModel.countForCurrentBan(occupant.id, env.violationRetentionDays, client);
  if (strikes < BAN_VIOLATION_THRESHOLD) await occupantsModel.liftBanAfterRecount(occupant.id, client);
  return removed;
}

/** Current strike count (0-3) for an occupant. */
export async function currentStrikes(occupant) {
  if (!occupant || occupant.status === "BANNED") return occupant ? BAN_VIOLATION_THRESHOLD : 0;
  return Math.min(await violationsModel.countStrikes(occupant.id, env.violationRetentionDays), BAN_VIOLATION_THRESHOLD);
}
