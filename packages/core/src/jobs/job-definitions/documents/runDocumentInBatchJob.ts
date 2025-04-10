import { Job } from 'bullmq'

import { Commit, Dataset, DocumentVersion, Workspace } from '../../../browser'
import { getBatchRows } from '../batchEvaluations'
import { documentsQueue } from '../../queues'

export type RunDocumentInBatchJobProps = {
  commit: Commit
  document: DocumentVersion
  dataset: Dataset
  workspace: Workspace
  autoRespondToolCalls: boolean
  fromLine?: number
  toLine?: number
  parametersMap?: Record<string, number>
}

export const runDocumentInBatchJob = async (
  job: Job<RunDocumentInBatchJobProps>,
) => {
  const {
    commit,
    dataset,
    document,
    workspace,
    autoRespondToolCalls,
    fromLine,
    toLine,
    parametersMap,
  } = job.data
  const rows = await getBatchRows({
    dataset,
    fromLine,
    toLine,
    parametersMap,
  })

  for (let i = 0; i < rows.length; i++) {
    await documentsQueue.add('runDocumentJob', {
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: commit.projectId,
      parameters: rows[i]!.parameters,
      autoRespondToolCalls,
    })
  }
}
