import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { findOrCreateDataset } from './findOrCreate'
import { User, Workspace } from '../../browser'
import { HashAlgorithmFn } from './utils'
import {
  buildDocumentLogDataset,
  ColumnFilters,
} from '../documentLogs/buildDocumentLogDataset'
import { updateDataset } from './update'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'
export const createDatasetFromLogs = async (
  {
    author,
    workspace,
    data,
    hashAlgorithm,
  }: {
    author: User
    workspace: Workspace
    data: {
      name: string
      documentLogIds: number[]
      columnFilters?: ColumnFilters
    }
    hashAlgorithm?: HashAlgorithmFn
  },
  db = database,
) => {
  const result = await findOrCreateDataset(
    { name: data.name, author, workspace },
    db,
  )
  if (result.error) return result

  const dataset = result.value
  const builtLogsResult = await buildDocumentLogDataset({
    workspace,
    documentLogIds: data.documentLogIds,
    columnFilters: data.columnFilters,
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
