import { Job } from 'bullmq'
import { findScheduledTriggersDueToRun } from '../../../services/documentTriggers/handlers/scheduled'
import { ProcessScheduledTriggerJobData } from './processScheduledTriggerJob'
import { setupQueues } from '../../../jobs'
import { HEAD_COMMIT } from '../../../constants'

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

  // Get the queue instance
  const jobQueues = await setupQueues()

  // Enqueue individual jobs for each trigger
  const jobPromises = triggers.map(async (trigger) => {
    const jobData: ProcessScheduledTriggerJobData = {
      documentTriggerId: trigger.id,
      documentTriggerUuid: trigger.uuid,
      workspaceId: trigger.workspaceId,
      projectId: trigger.projectId,
      documentUuid: trigger.documentUuid,
      commitUuid: HEAD_COMMIT, // Always use the latest version
      parameters: trigger.configuration.parameters,
    }

    // Enqueue with some delay to prevent all jobs starting at exactly the same time
    const randomDelay = Math.floor(Math.random() * 2000) // 0-2 seconds random delay

    const job =
      await jobQueues.defaultQueue.jobs.enqueueProcessScheduledTriggerJob(
        jobData,
        {
          delay: randomDelay,
          removeOnComplete: true,
          removeOnFail: false, // Keep failed jobs for debugging
          attempts: 3, // Allow up to 3 attempts for each trigger
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 second delay, then exponential backoff
          },
        },
      )

    console.log(
      `Enqueued job ${job.id} for trigger ${trigger.uuid} (document: ${trigger.documentUuid})`,
    )
    return { success: true, jobId: job.id }
  })

  // Wait for all enqueue operations to complete and count successes/failures
  const results = await Promise.all(jobPromises)
  const successCount = results.filter((r) => r.success).length
  const failureCount = results.length - successCount

  console.log(
    `Successfully enqueued ${successCount} scheduled trigger jobs` +
      (failureCount > 0 ? `, ${failureCount} failed` : ''),
  )
}
