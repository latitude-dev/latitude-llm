import { Dataset, DatasetRow } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetRowData, datasetRows } from '../../schema/models/datasetRows'

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
  transaction = new Transaction(),
) {
  const rows = data.rows.map((rowData) => ({
    workspaceId: dataset.workspaceId,
    datasetId: dataset.id,
    rowData,
  }))

  if (!rows.length) return Result.ok([])

  return await transaction.call<DatasetRow[]>(async (trx) => {
    const result = await trx.insert(datasetRows).values(rows).returning()
    return Result.ok(result)
  })
}
