import { Job } from 'bullmq'
import { DocumentTrigger, HEAD_COMMIT } from '../../../browser'
import { updateScheduledTriggerLastRun } from '../../../services/documentTriggers/handlers/scheduled'
import { setupQueues } from '../../../jobs'
import { RunDocumentJobData } from '../documents/runDocumentJob'
import { DEFAULT_JOB_OPTIONS } from '../../queues'
import { ScheduledTriggerConfiguration } from '../../../services/documentTriggers/helpers/schema'

export type ProcessScheduledTriggerJobData = {
  documentTriggerId: number
  documentTriggerUuid: string
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid?: string // Optional, defaults to HEAD
  parameters?: Record<string, unknown>
}

/**
 * Job that processes a single scheduled document trigger.
 *
 * This job is responsible for:
 * 1. Running the document associated with the trigger by enqueueing a runDocumentJob
 * 2. Updating the trigger's last run time and calculating next run time
 */
export const processScheduledTriggerJob = async (
  job: Job<ProcessScheduledTriggerJobData>,
) => {
  const {
    documentTriggerId,
    documentTriggerUuid,
    workspaceId,
    projectId,
    documentUuid,
    commitUuid = HEAD_COMMIT, // Default to HEAD if not specified
    parameters = {},
  } = job.data

  let documentJobEnqueued = false

  try {
    console.log(
      `[ScheduledTrigger:${documentTriggerUuid}] Processing scheduled trigger for document ${documentUuid}`,
    )

    // Get the queues to enqueue the document run job
    const jobQueues = await setupQueues()

    // Prepare data for the document run job
    const runJobData: RunDocumentJobData = {
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      parameters,
      // Using a dedicated batch ID for scheduled triggers
      batchId: `scheduled-${documentTriggerUuid}-${Date.now()}`,
    }

    // Enqueue the document run job
    console.log(
      `[ScheduledTrigger:${documentTriggerUuid}] Enqueueing document run job for ${documentUuid}`,
    )

    const docJob = await jobQueues.defaultQueue.jobs.enqueueRunDocumentJob(
      runJobData,
      {
        ...DEFAULT_JOB_OPTIONS,
        removeOnComplete: true,
        removeOnFail: false, // Keep failed jobs for debugging
      },
    )

    documentJobEnqueued = true
    console.log(
      `[ScheduledTrigger:${documentTriggerUuid}] Document run job enqueued with ID: ${docJob.id}`,
    )

    // Create a trigger object with the ID for updating
    const trigger: Pick<DocumentTrigger, 'id' | 'uuid'> = {
      id: documentTriggerId,
      uuid: documentTriggerUuid,
    }

    // Update the last run time and calculate next run time
    const updateResult = await updateScheduledTriggerLastRun(trigger)

    if (updateResult.error) {
      console.error(
        `[ScheduledTrigger:${documentTriggerUuid}] Failed to update trigger:`,
        updateResult.error,
      )
      // Don't throw here, as we've already enqueued the document job
      // We'll just log the error and continue
    } else {
      const updatedTrigger = updateResult.unwrap()
      const config =
        updatedTrigger.configuration as ScheduledTriggerConfiguration

      console.log(
        `[ScheduledTrigger:${documentTriggerUuid}] Successfully updated trigger, next run at ${
          config.nextRunTime
            ? new Date(config.nextRunTime).toISOString()
            : 'unknown'
        }`,
      )
    }

    return { success: true, documentJobId: docJob.id }
  } catch (error) {
    console.error(
      `[ScheduledTrigger:${documentTriggerUuid}] Error processing trigger:`,
      error,
    )

    // If we failed before enqueueing the document job, we should rethrow
    // to make sure the scheduler retries this job
    if (!documentJobEnqueued) {
      throw error
    }

    // Otherwise, return a partial success
    return {
      success: documentJobEnqueued,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
