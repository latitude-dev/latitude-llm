import { Result } from '../../lib/Result'
import {
  Dataset,
  ExtendedDocumentLogFilterOptions,
  Workspace,
} from '../../browser'
import {
  buildDocumentLogDataset,
  ColumnFilters,
  DocumentLogDataset,
} from '../documentLogs/buildDocumentLogDataset'
import { DatasetRowsRepository, DatasetsRepository } from '../../repositories'
import { HashAlgorithmFn, nanoidHashAlgorithm } from './utils'
import { DatasetRowData } from '../../schema'

const PREVIEW_LOGS_LIMIT = 1000

async function getFirstRowsFromDataset({
  dataset,
}: {
  dataset: Dataset | undefined
}) {
  if (!dataset) return []

  const repo = new DatasetRowsRepository(dataset.workspaceId)
  const rows = await repo.findByDatasetPaginated({
    datasetId: dataset.id,
    page: '1',
    pageSize: '5',
  })
  return rows.map((row) => row.rowData)
}

function getRelevantLogRows(documentLogDataset: DocumentLogDataset) {
  const parameterColumns = documentLogDataset.columns.filter(
    (column) => column.role === 'parameter',
  )
  return documentLogDataset.rows.reduce(
    (acc: { columnSet: Set<string>; rows: DatasetRowData[] }, row) => {
      const informedParameters = parameterColumns
        .filter((column) => row[column.identifier])
        .map((column) => column.name)
      if (!acc.columnSet.has(informedParameters.toString())) {
        acc.rows.push(row)
        // Stringify the array to avoid comparing by reference https://stackoverflow.com/questions/29760644/storing-arrays-in-es6-set-and-accessing-them-by-value
        acc.columnSet.add(informedParameters.toString())
      }
      return acc
    },
    { columnSet: new Set<string>(), rows: [] },
  ).rows
}

async function getDataset(workspace: Workspace, name?: string) {
  if (!name) return
  const repo = new DatasetsRepository(workspace.id)
  const datasets = await repo.findByName(name)
  if (datasets.length === 0) return
  return datasets[0]
}

/**
 * This service is responsible for obtaining a preview of the dataset that would be generated
 * including the logs provided. The dataset rows are limited to the first 5 and the logs are
 * chosen keeping only the ones with different parameters (limited to PREVIEW_LOGS_LIMIT)
 */
export const previewDatasetFromLogs = async ({
  workspace,
  documentUuid,
  extendedFilterOptions,
  name,
  columnFilters,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  workspace: Workspace
  documentUuid: string
  extendedFilterOptions?: ExtendedDocumentLogFilterOptions
  name?: string
  columnFilters?: ColumnFilters
  hashAlgorithm?: HashAlgorithmFn
}) => {
  const dataset = await getDataset(workspace, name)
  const documentLogDataset = await buildDocumentLogDataset({
    workspace,
    documentUuid,
    dataset,
    extendedFilterOptions,
    columnFilters,
    hashAlgorithm,
    rowLimit: PREVIEW_LOGS_LIMIT,
  })
  if (documentLogDataset.error) return documentLogDataset

  const datasetRows = await getFirstRowsFromDataset({ dataset })
  const logRows = getRelevantLogRows(documentLogDataset.value)

  return Result.ok({
    columns: documentLogDataset.value.columns,
    existingRows: datasetRows,
    newRows: logRows,
  })
}
