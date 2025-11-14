import { type Dataset } from '../../schema/models/types/Dataset'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'
import { buildSpanDatasetRows } from '../tracing/spans/buildSpanDatasetRows'
import { updateDataset } from './update'
import { HashAlgorithmFn } from './utils'

export const updateDatasetFromSpans = async (
  {
    workspace,
    dataset,
    spanIdentifiers,
    hashAlgorithm,
  }: {
    workspace: Workspace
    dataset: Dataset
    spanIdentifiers: Array<{ traceId: string; spanId: string }>
    hashAlgorithm?: HashAlgorithmFn
  },
  transaction = new Transaction(),
) => {
  const builtSpansResult = await buildSpanDatasetRows({
    workspace,
    spanIdentifiers,
    dataset,
    hashAlgorithm,
  })
  if (builtSpansResult.error) return builtSpansResult
  const exportedSpans = builtSpansResult.value

  const ds = await updateDataset(
    { dataset, data: { columns: exportedSpans.columns } },
    transaction,
  )
  if (ds.error) return ds
  const row = await insertRowsInBatch(
    {
      dataset,
      data: { rows: exportedSpans.rows },
    },
    transaction,
  )
  if (row.error) return row

  return Result.ok(ds.value)
}
