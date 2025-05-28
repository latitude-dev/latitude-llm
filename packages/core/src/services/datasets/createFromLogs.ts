import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { Dataset, Workspace } from '../../browser'
import { HashAlgorithmFn } from './utils'
import {
  buildDocumentLogDataset,
  ColumnFilters,
} from '../documentLogs/buildDocumentLogDataset'
import { updateDataset } from './update'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'

export const updateDatasetFromLogs = async (
  {
    workspace,
    dataset,
    documentLogIds,
    columnFilters,
    hashAlgorithm,
  }: {
    workspace: Workspace
    dataset: Dataset
    documentLogIds: number[]
    columnFilters?: ColumnFilters
    hashAlgorithm?: HashAlgorithmFn
  },
  db = database,
) => {
  const builtLogsResult = await buildDocumentLogDataset({
    workspace,
    documentLogIds,
    columnFilters,
    dataset,
    hashAlgorithm,
  })
  if (builtLogsResult.error) return builtLogsResult
  const exportedLogs = builtLogsResult.value

  return await Transaction.call(async (trx) => {
    const ds = await updateDataset(
      { dataset, data: { columns: exportedLogs.columns } },
      trx,
    ).then((r) => r.unwrap())

    await insertRowsInBatch(
      {
        dataset,
        data: { rows: exportedLogs.rows },
      },
      trx,
    ).then((r) => r.unwrap())

    return Result.ok(ds)
  }, db)
}
