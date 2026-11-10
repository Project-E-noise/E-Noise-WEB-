import * as noiseReadingsModel from "../models/noiseReadingsModel.js";
import * as incidentsModel from "../models/incidentsModel.js";
import * as tableAssignmentsModel from "../models/tableAssignmentsModel.js";
import { env } from "../config/env.js";
import { cleanupOldViolations } from "./violationsService.js";

// Data retention jobs (started from server.js).

/**
 * Deletes raw noise readings older than NOISE_READINGS_RETENTION_DAYS, in
 * batches until none are left. Incidents, violations and sensor_status are
 * separate tables and are not touched. Returns the total deleted.
 */
export async function cleanupOldReadings(days = env.noiseReadingsRetentionDays, batchSize = 50000) {
  let total = 0;
  for (;;) {
    const deleted = await noiseReadingsModel.deleteOlderThanBatch(days, batchSize);
    total += deleted;
    if (deleted < batchSize) return total;
  }
}

/**
 * Personal data older than VIOLATION_RETENTION_DAYS: deletes violations,
 * removes the occupant from old incidents, and deletes released seat
 * history. Active seats and running bans (stored on the occupant) stay.
 */
export async function cleanupPersonalData(days = env.violationRetentionDays) {
  const violations = await cleanupOldViolations(days);
  const incidents = await incidentsModel.unlinkOccupantsOlderThan(days);
  const assignments = await tableAssignmentsModel.deleteReleasedOlderThan(days);
  return { violations, incidents, assignments };
}
