import { ExecuteDocumentTriggerJobData } from '../../../jobs/job-definitions/documentTriggers/runDocumentTriggerEventJob'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentTriggerEvent } from '../../../schema/models/types/DocumentTriggerEvent'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { queues } from '../../../jobs/queues'
import { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'

export async function enqueueRunDocumentFromTriggerEventJob({
  workspace,
  documentTriggerEvent,
  commit,
}: {
  workspace: Workspace
  documentTriggerEvent: DocumentTriggerEvent
  commit: Commit
}): PromisedResult<undefined> {
  const jobData: ExecuteDocumentTriggerJobData = {
    workspaceId: workspace.id,
    documentTriggerEventId: documentTriggerEvent.id,
    commitId: commit.id,
  }

  const { documentsQueue } = await queues()
  await documentsQueue.add('runDocumentTriggerEventJob', jobData, {
    attempts: 1,
  })

  return Result.nil()
}
