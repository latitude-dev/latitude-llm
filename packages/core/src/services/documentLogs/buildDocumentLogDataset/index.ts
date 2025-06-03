import { Column, DatasetRowData } from '@latitude-data/core/schema'
import {
  Dataset,
  ExtendedDocumentLogFilterOptions,
  Workspace,
} from '../../../browser'
import { HashAlgorithmFn, nanoidHashAlgorithm } from '../../datasets/utils'
import { DocumentLogsWithMetadataAndErrorsCursor } from '../../../repositories/documentLogsWithMetadataAndErrorsRepository'
import { buildColumns } from './buildColumns'
import { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { findProviderOutputs, ProviderOutput } from './findProviderOutputs'
import { buildRows } from './buildRows'
import { computeDocumentLogsWithMetadataWithCursor } from '../computeDocumentLogsWithMetadata'
import { DocumentLogWithMetadataAndError } from '../../../repositories/runErrors/documentLogsRepository'

export type DocumentLogDataset = {
  columns: Column[]
  rows: DatasetRowData[]
}

export type ColumnFilters = {
  staticColumnNames?: string[]
  parameterColumnNames?: string[]
}

const BATCH_SIZE = 1000

async function retrieveLogs(
  workspace: Workspace,
  documentUuid: string,
  extendedFilterOptions?: ExtendedDocumentLogFilterOptions,
  limit?: number,
): Promise<{
  logs: DocumentLogWithMetadataAndError[]
  providerOutputs: Map<string, ProviderOutput>
}> {
  let cursor: DocumentLogsWithMetadataAndErrorsCursor | undefined = undefined
  const allLogs: DocumentLogWithMetadataAndError[] = []
  const allProviderOutputs: Map<string, ProviderOutput> = new Map()
  while (true) {
    if (limit && allLogs.length >= limit) break
    const { logs, nextCursor } =
      await computeDocumentLogsWithMetadataWithCursor({
        workspace,
        documentUuid,
        extendedFilterOptions,
        cursor,
        limit: BATCH_SIZE,
      })
    const providerOutputs = await findProviderOutputs(workspace, logs)
    providerOutputs.forEach((value, key) => {
      allProviderOutputs.set(key, value)
    })
    allLogs.push(...logs)
    if (!nextCursor) break
    cursor = nextCursor
  }
  return { logs: allLogs, providerOutputs: allProviderOutputs }
}

/**
 * This service is responsible for extracting all data interesting from document logs as a dataset.
 * The final dataset columns can be configured with the `columnFilters` parameter.
 * To improve performance, the logs are retrieved in batches and the dataset is built incrementally.
 */
export async function buildDocumentLogDataset({
  workspace,
  documentUuid,
  dataset,
  extendedFilterOptions,
  columnFilters,
  hashAlgorithm = nanoidHashAlgorithm,
  limit,
}: {
  workspace: Workspace
  documentUuid: string
  extendedFilterOptions?: ExtendedDocumentLogFilterOptions
  dataset?: Dataset
  columnFilters?: ColumnFilters
  hashAlgorithm?: HashAlgorithmFn
  limit?: number
}): PromisedResult<DocumentLogDataset> {
  const { logs, providerOutputs } = await retrieveLogs(
    workspace,
    documentUuid,
    extendedFilterOptions,
    limit,
  )
  const columns = buildColumns(logs, hashAlgorithm, dataset, columnFilters)
  const rows = buildRows(logs, providerOutputs, columns)
  return Result.ok({ columns, rows })
}
