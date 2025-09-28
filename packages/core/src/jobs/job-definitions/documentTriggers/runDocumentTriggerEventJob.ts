import { Job } from 'bullmq'
import {
  CommitsRepository,
  DocumentTriggerEventsRepository,
} from '../../../repositories'
import { runDocumentFromTriggerEvent } from '../../../services/documentTriggers/triggerEvents/runFromEvent'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { Result } from '../../../lib/Result'

export type ExecuteDocumentTriggerJobData = {
  workspaceId: number
  documentTriggerEventId: number
  commitId: number
}

/**
 * Job that executes a single document trigger event.
 */
export const runDocumentTriggerEventJob = async (
  job: Job<ExecuteDocumentTriggerJobData>,
) => {
  const { workspaceId, documentTriggerEventId, commitId } = job.data
  const workspace = (await unsafelyFindWorkspace(workspaceId))!

  const documentTriggerEventsScope = new DocumentTriggerEventsRepository(
    workspaceId,
  )
  const documentTriggerEventResult = await documentTriggerEventsScope.find(
    documentTriggerEventId,
  )
  const documentTriggerEvent = documentTriggerEventResult.unwrap()

  const commitsScope = new CommitsRepository(workspaceId)
  const commitResult = await commitsScope.find(commitId)
  if (!Result.isOk(commitResult)) return commitResult
  const commit = commitResult.unwrap()

  await runDocumentFromTriggerEvent({
    workspace,
    documentTriggerEvent,
    commit,
  }).then((r) => r.unwrap())
}
