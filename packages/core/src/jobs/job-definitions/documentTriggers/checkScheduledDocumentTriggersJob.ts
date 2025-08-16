import { Job } from 'bullmq'
import { findAndRegisterScheduledTriggerEvents } from '../../../services/documentTriggers/handlers/scheduled/registerEvents'

export type CheckScheduledDocumentTriggersJobData = unknown

/**
 * Job that runs every minute to check for scheduled document triggers that need to be executed.
 *
 * This job:
 * 1. Uses an optimized query to find all triggers due to run
 * 2. For each trigger:
 *    - Updates the trigger's next run time
 *    - Registers the trigger event
 *    - Enqueues a separate job to handle the actual document execution
 */
export const checkScheduledDocumentTriggersJob = async (
  _: Job<CheckScheduledDocumentTriggersJobData>,
) => {
  findAndRegisterScheduledTriggerEvents().then((r) => r.unwrap())
}
