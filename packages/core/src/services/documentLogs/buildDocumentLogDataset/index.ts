import { Column, DatasetRowData } from '@latitude-data/core/schema'
import { Dataset, Workspace } from '../../../browser'
import { HashAlgorithmFn, nanoidHashAlgorithm } from '../../datasets/utils'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../../repositories/documentLogsWithMetadataAndErrorsRepository'
import { buildColumns } from './buildColumns'
import { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { findProviderOutputs } from './findProviderOutputs'
import { buildRows } from './buildRows'

export type ExportedDocumentLogs = {
  columns: Column[]
  rows: DatasetRowData[]
}

export type ColumnFilters = {
  staticColumnNames?: string[]
  parameterColumnNames?: string[]
}

/**
 * This service is responsible of extracting all data
 * interesting from document logs as a dataset. The final dataset columns
 * can be configured with the `columnFilters` parameter.
 */
export async function buildDocumentLogDataset({
  workspace,
  dataset,
  documentLogIds,
  columnFilters,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  workspace: Workspace
  documentLogIds: number[]
  columnFilters?: ColumnFilters
  dataset?: Dataset
  hashAlgorithm?: HashAlgorithmFn
}): PromisedResult<ExportedDocumentLogs> {
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id)
  const logs = await repo
    .findManyWithoutErrors(documentLogIds)
    .then((r) => r.unwrap())
  const columns = buildColumns({
    dataset,
    hashAlgorithm,
    logs,
    columnFilters,
  })
  const expectedOutputs = await findProviderOutputs(workspace, logs)
  const rows = buildRows(logs, expectedOutputs, columns)
  return Result.ok({ columns, rows })
}
