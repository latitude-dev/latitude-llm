import { Job } from 'bullmq'
import { findScheduledTriggersDueToRun } from '../../../services/documentTriggers/handlers/scheduled'
import { ProcessScheduledTriggerJobData } from './processScheduledTriggerJob'
import { HEAD_COMMIT } from '../../../constants'
import { defaultQueue } from '../../queues'

export type CheckScheduledDocumentTriggersJobData = unknown

/**
 * Job that runs every minute to check for scheduled document triggers that need to be executed.
 *
 * This job:
 * 1. Uses an optimized query to find all triggers due to run
 * 2. For each trigger, enqueues a separate job to handle the actual document execution
 */
export const checkScheduledDocumentTriggersJob = async (
  _: Job<CheckScheduledDocumentTriggersJobData>,
) => {
  // Find scheduled triggers that are due to run
  const triggersResult = await findScheduledTriggersDueToRun()

  if (triggersResult.error) {
    console.error('Error finding scheduled triggers:', triggersResult.error)
    throw triggersResult.error
  }

  const triggers = triggersResult.unwrap()
  console.log(`Found ${triggers.length} scheduled triggers due to run`)

  // Enqueue individual jobs for each trigger
  triggers.forEach(async (trigger) => {
    const jobData: ProcessScheduledTriggerJobData = {
      documentTriggerId: trigger.id,
      documentTriggerUuid: trigger.uuid,
      workspaceId: trigger.workspaceId,
      projectId: trigger.projectId,
      documentUuid: trigger.documentUuid,
      commitUuid: HEAD_COMMIT, // Always use the latest version
      parameters: trigger.configuration.parameters,
    }

    await defaultQueue.add('processScheduledTriggerJob', jobData)
  })
}
