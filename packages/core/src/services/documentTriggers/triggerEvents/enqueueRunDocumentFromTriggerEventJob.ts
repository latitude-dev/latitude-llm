import { ExecuteDocumentTriggerJobData } from '../../../jobs/job-definitions/documentTriggers/runDocumentTriggerEventJob'
import { DocumentTriggerEvent, Workspace } from '../../../browser'
import { documentsQueue } from '../../../jobs/queues'
import { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'

export async function enqueueRunDocumentFromTriggerEventJob({
  workspace,
  documentTriggerEvent,
}: {
  workspace: Workspace
  documentTriggerEvent: DocumentTriggerEvent
}): PromisedResult<undefined> {
  const jobData: ExecuteDocumentTriggerJobData = {
    workspaceId: workspace.id,
    documentTriggerEventId: documentTriggerEvent.id,
  }

  await documentsQueue.add('runDocumentTriggerEventJob', jobData)

  return Result.nil()
}
