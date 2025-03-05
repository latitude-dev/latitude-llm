import { DatasetRow, DatasetV2 } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { DatasetRowData, datasetRows } from '../../schema'

export async function insertRowsInBatch(
  {
    dataset,
    data,
  }: {
    dataset: DatasetV2
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
  return await Transaction.call<DatasetRow[]>(async (trx) => {
    const result = await trx.insert(datasetRows).values(rows).returning()
    return Result.ok(result)
  }, db)
}
