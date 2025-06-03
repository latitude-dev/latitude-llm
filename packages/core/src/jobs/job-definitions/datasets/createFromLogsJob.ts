import { Job } from 'bullmq'
import { ExtendedDocumentLogFilterOptions } from '../../../constants'
import { findOrCreateDataset } from '../../../services/datasets/findOrCreate'
import { updateDatasetFromLogs } from '../../../services/datasets/updateFromLogs'
import { defaultQueue } from '../../queues'
import { User, Workspace } from '../../../browser'

type CreateDatasetFromLogsJobProps = {
  name: string
  author: User
  workspace: Workspace
  documentUuid: string
  extendedFilterOptions: ExtendedDocumentLogFilterOptions
}

// TODO: Add again progress to this job
export const createDatasetFromLogsJob = async (
  job: Job<CreateDatasetFromLogsJobProps>,
) => {
  const { name, author, workspace, documentUuid, extendedFilterOptions } =
    job.data

  const dataset = await findOrCreateDataset({
    name,
    author,
    workspace,
  }).then((r) => r.unwrap())

  await updateDatasetFromLogs({
    workspace,
    documentUuid,
    dataset,
    extendedFilterOptions,
  }).then((r) => r.unwrap())

  defaultQueue.add('notifyClientOfDatasetUpdate', {
    userId: author.id,
    datasetId: dataset.id,
    workspaceId: workspace.id,
  })
}
