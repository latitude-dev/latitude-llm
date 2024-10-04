import {
  Commit,
  Dataset,
  DocumentVersion,
  Workspace,
} from '@latitude-data/core/browser'
import { previewDataset } from '@latitude-data/core/services/datasets/preview'
import { Job } from 'bullmq'

import { setupJobs } from '../..'

type RunDocumentInBatchJobProps = {
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
  console.log(commit)

  const fileMetadata = dataset.fileMetadata

  const result = await previewDataset({
    dataset,
    fromLine,
    toLine: toLine || fileMetadata.rowCount,
  }).then((r) => r.unwrap())

  const { rows } = result

  const parameters = rows.map((row) => {
    return Object.fromEntries(
      Object.entries(parametersMap!).map(([key, index]) => [key, row[index]!]),
    )
  })

  const jobs = await setupJobs()

  for (let i = 0; i < parameters.length; i++) {
    await jobs.defaultQueue.jobs.enqueueRunDocumentJob({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: commit.projectId,
      parameters: parameters[i],
    })
  }
}
