import { Dataset, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'
import { buildDocumentLogDatasetRows } from '../documentLogs/buildDocumentLogDatasetRows'
import { updateDataset } from './update'
import { HashAlgorithmFn } from './utils'

export const updateDatasetFromLogs = async (
  {
    workspace,
    dataset,
    documentLogIds,
    hashAlgorithm,
  }: {
    workspace: Workspace
    dataset: Dataset
    documentLogIds: number[]
    hashAlgorithm?: HashAlgorithmFn
  },
  transaction = new Transaction(),
) => {
  const builtLogsResult = await buildDocumentLogDatasetRows({
    workspace,
    documentLogIds,
    dataset,
    hashAlgorithm,
  })
  if (!Result.isOk(builtLogsResult)) return builtLogsResult
  const exportedLogs = builtLogsResult.value

  const ds = await updateDataset(
    { dataset, data: { columns: exportedLogs.columns } },
    transaction,
  )
  if (!Result.isOk(ds)) return ds
  const row = await insertRowsInBatch(
    {
      dataset,
      data: { rows: exportedLogs.rows },
    },
    transaction,
  )
  if (!Result.isOk(row)) return row

  return Result.ok(ds.value)
}
