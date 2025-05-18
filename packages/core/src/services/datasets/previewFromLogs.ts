import { Result } from '../../lib/Result'
import { Dataset, Workspace } from '../../browser'
import {
  buildDocumentLogDataset,
  ColumnFilters,
} from '../documentLogs/buildDocumentLogDataset'
import { DatasetRowsRepository, DatasetsRepository } from '../../repositories'
import { HashAlgorithmFn, nanoidHashAlgorithm } from './utils'

async function getFirstRowsFromDataset({
  dataset,
}: {
  dataset: Dataset | undefined
}) {
  if (!dataset) return []

  const repo = new DatasetRowsRepository(dataset.workspaceId)
  const rows = await repo.findByDatasetPaginated({
    datasetId: dataset.id,
    pageSize: '5',
  })
  return rows.map((row) => row.rowData)
}

export const previewDatasetFromLog = async ({
  workspace,
  data,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  workspace: Workspace
  data: {
    name: string
    documentLogIds: number[]
    columnFilters?: ColumnFilters
  }
  hashAlgorithm?: HashAlgorithmFn
}) => {
  const repo = new DatasetsRepository(workspace.id)
  const datasets = await repo.findByName(data.name)
  const dataset = datasets[0]
  const result = await buildDocumentLogDataset({
    workspace,
    documentLogIds: data.documentLogIds,
    dataset,
    columnFilters: data.columnFilters,
    hashAlgorithm,
  })
  const datasetRows = await getFirstRowsFromDataset({ dataset })

  if (result.error) return result

  return Result.ok({
    columns: result.value.columns,
    existingRows: datasetRows,
    newRows: result.value.rows,
  })
}
