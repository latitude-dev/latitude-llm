import { Dataset, DatasetRow } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetRowData, datasetRows } from '../../schema'

export async function insertRowsInBatch(
  {
    dataset,
    data,
  }: {
    dataset: Dataset
    data: {
      rows: DatasetRowData[]
    }
  },
  db = database,
) {
  const rows = data.rows.map((rowData) => ({
    workspaceId: dataset.workspaceId,
    datasetId: dataset.id,
    rowData,
  }))

  if (!rows.length) {
    return Result.ok([])
  }

  return await Transaction.call<DatasetRow[]>(async (trx) => {
    const result = await trx.insert(datasetRows).values(rows).returning()
    return Result.ok(result)
  }, db)
}
