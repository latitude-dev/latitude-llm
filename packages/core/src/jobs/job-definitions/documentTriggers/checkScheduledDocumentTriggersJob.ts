import { Job } from 'bullmq'
import { findScheduledTriggersDueToRun } from '../../../services/documentTriggers/handlers/scheduled'
import { ProcessScheduledTriggerJobData } from './processScheduledTriggerJob'
import { setupJobs } from '../../../jobs'

// For sentry error reporting
const captureException = (error: unknown) => {
  console.error('Error captured:', error)
}

export type CheckScheduledDocumentTriggersJobData = unknown

/**
 * Job that runs every minute to check for scheduled document triggers that need to be executed.
 *
 * This job:
 * 1. Uses an optimized query to find all triggers due to run
 * 2. For each trigger, enqueues a separate job to handle the actual document execution
 *
 * This approach improves:
 * - Fault isolation: Each trigger runs in its own job
 * - Parallelization: Multiple triggers can run concurrently
 * - Resource utilization: The work is distributed across time
 */
export const checkScheduledDocumentTriggersJob = async (
  _: Job<CheckScheduledDocumentTriggersJobData>,
) => {
  try {
    // Find scheduled triggers that are due to run
    const triggersResult = await findScheduledTriggersDueToRun()

    if (triggersResult.error) {
      console.error('Error finding scheduled triggers:', triggersResult.error)
      throw triggersResult.error
    }

    const triggers = triggersResult.unwrap()
    console.log(`Found ${triggers.length} scheduled triggers due to run`)

    // Get the queue instance
    const jobQueues = await setupJobs()

    // Enqueue individual jobs for each trigger
    const jobPromises = triggers.map(async (trigger) => {
      try {
        const jobData: ProcessScheduledTriggerJobData = {
          documentTriggerId: trigger.id,
          documentTriggerUuid: trigger.uuid,
          workspaceId: trigger.workspaceId,
          projectId: trigger.projectId,
          documentUuid: trigger.documentUuid,
          commitUuid: 'HEAD', // Always use the latest version
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
      } catch (error) {
        console.error(`Error enqueuing job for trigger ${trigger.uuid}:`, error)
        captureException(error)
        // Continue with other triggers even if one fails
        return { success: false, error, triggerUuid: trigger.uuid }
      }
    })

    // Wait for all enqueue operations to complete and count successes/failures
    const results = await Promise.all(jobPromises)
    const successCount = results.filter((r) => r.success).length
    const failureCount = results.length - successCount

    console.log(
      `Successfully enqueued ${successCount} scheduled trigger jobs` +
        (failureCount > 0 ? `, ${failureCount} failed` : ''),
    )
  } catch (error) {
    console.error('Error in checkScheduledDocumentTriggersJob:', error)
    captureException(error)
    throw error
  }
}
