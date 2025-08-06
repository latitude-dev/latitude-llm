import { Job } from 'bullmq'
import { DocumentTriggerEventsRepository } from '../../../repositories'
import { runDocumentFromTriggerEvent } from '../../../services/documentTriggers/triggerEvents/runFromEvent'
import { unsafelyFindWorkspace } from '../../../data-access'

export type ExecuteDocumentTriggerJobData = {
  workspaceId: number
  documentTriggerEventId: number
}

/**
 * Job that executes a single document trigger event.
 */
export const runDocumentTriggerEventJob = async (
  job: Job<ExecuteDocumentTriggerJobData>,
) => {
  const { workspaceId, documentTriggerEventId } = job.data
  const workspace = (await unsafelyFindWorkspace(workspaceId))!

  const documentTriggerEventsScope = new DocumentTriggerEventsRepository(
    workspaceId,
  )
  const documentTriggerEventResult = await documentTriggerEventsScope.find(
    documentTriggerEventId,
  )
  const documentTriggerEvent = documentTriggerEventResult.unwrap()

  await runDocumentFromTriggerEvent({
    workspace,
    documentTriggerEvent,
  }).then((r) => r.unwrap())

  return { success: true }
}
