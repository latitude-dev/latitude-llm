import { Result } from '../../lib/Result'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type Workspace } from '../../schema/models/types/Workspace'
import { buildSpanDatasetRows } from '../tracing/spans/buildSpanDatasetRows'
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

export const previewDatasetFromSpans = async ({
  workspace,
  data,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  workspace: Workspace
  data: {
    name: string
    spanIdentifiers: Array<{ traceId: string; spanId: string }>
  }
  hashAlgorithm?: HashAlgorithmFn
}) => {
  const repo = new DatasetsRepository(workspace.id)
  const datasets = await repo.findByName(data.name)
  const dataset = datasets[0]
  const result = await buildSpanDatasetRows({
    workspace,
    spanIdentifiers: data.spanIdentifiers,
    dataset,
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
