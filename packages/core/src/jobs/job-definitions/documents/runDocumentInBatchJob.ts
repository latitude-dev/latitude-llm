import { Job } from 'bullmq'

import { setupQueues } from '../..'
import { Commit, Dataset, DocumentVersion, Workspace } from '../../../browser'
import { getBatchRows } from '../batchEvaluations'

export type RunDocumentInBatchJobProps = {
  commit: Commit
  document: DocumentVersion
  dataset: Dataset
  workspace: Workspace
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

  const queues = await setupQueues()

  for (let i = 0; i < rows.length; i++) {
    await queues.defaultQueue.jobs.enqueueRunDocumentJob({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: commit.projectId,
      parameters: rows[i]!.parameters,
    })
  }
}
