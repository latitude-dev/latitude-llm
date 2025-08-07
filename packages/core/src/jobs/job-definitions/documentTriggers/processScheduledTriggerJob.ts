import { Job } from 'bullmq'
import { DocumentTrigger, HEAD_COMMIT } from '../../../browser'
import { updateScheduledTriggerLastRun } from '../../../services/documentTriggers/handlers/scheduled'
import { documentsQueue } from '../../queues'
import { RunDocumentJobData } from '../documents/runDocumentJob'

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

  // Get the queues to enqueue the document run job
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

  const docJob = await documentsQueue.add('runDocumentJob', runJobData)

  // Create a trigger object with the ID for updating
  const trigger: Pick<DocumentTrigger, 'id' | 'uuid'> = {
    id: documentTriggerId,
    uuid: documentTriggerUuid,
  }

  // Update the last run time and calculate next run time
  const updateResult = await updateScheduledTriggerLastRun(trigger)

  if (updateResult.error) {
    // Don't throw here, as we've already enqueued the document job
    // We'll just log the error and continue
  } else {
    updateResult.unwrap()
  }

  return { success: true, documentJobId: docJob.id }
}
