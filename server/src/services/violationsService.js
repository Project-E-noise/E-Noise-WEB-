import * as violationsModel from "../models/violationsModel.js";
import { query } from "../config/db.js";

const BAN_VIOLATION_THRESHOLD = 3;
const BAN_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // one week

// Backend is authoritative for ban status — the frontend only ever displays
// what this function decides. Runs inside the same transaction as the
// incident insert (see incidentsService.createIncident) so a violation and
// its incident are always created together.
export async function recordViolationIfApplicable(incident, client) {
  if (incident.status !== "CONFIRMED" || !incident.occupant_id) return null;
  const runner = client || { query };

  const violationNumber = (await violationsModel.countForOccupant(incident.occupant_id, runner)) + 1;
  const violation = await violationsModel.create(
    {
      occupant_id: incident.occupant_id,
      incident_id: incident.id,
      table_id: incident.table_id,
      violation_number: violationNumber
    },
    runner
  );

  if (violationNumber >= BAN_VIOLATION_THRESHOLD) {
    const banStartedAt = new Date();
    const banUntil = new Date(Date.now() + BAN_DURATION_MS);
    await runner.query(
      `UPDATE occupants SET status = 'BANNED', ban_started_at = $2, ban_until = $3, updated_at = NOW() WHERE id = $1`,
      [incident.occupant_id, banStartedAt.toISOString(), banUntil.toISOString()]
    );
  }
  return violation;
}

export async function violationsForOccupant(occupantId) {
  return violationsModel.forOccupant(Number(occupantId));
}
