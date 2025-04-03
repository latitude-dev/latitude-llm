import { Job } from 'bullmq'

import { Commit, DatasetV2, DocumentVersion, Workspace } from '../../../browser'
import { getBatchRows } from '../batchEvaluations'
import { defaultQueue } from '../../queues'

export type RunDocumentInBatchJobProps = {
  commit: Commit
  document: DocumentVersion
  dataset: DatasetV2
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

  for (let i = 0; i < rows.length; i++) {
    await defaultQueue.add('runDocumentJob', {
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: commit.projectId,
      parameters: rows[i]!.parameters,
    })
  }
}
