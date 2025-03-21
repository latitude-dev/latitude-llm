import { and, eq, inArray } from 'drizzle-orm'
import { DatasetV2 } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { DatasetRowData, datasetRows, datasetsV2 } from '../../schema'

export const updateDatasetRow = async (
  {
    dataset,
    data,
  }: {
    dataset: DatasetV2
    data: {
      rows: {
        rowId: number
        rowData: DatasetRowData
      }[]
    }
  },
  db = database,
) => {
  return Transaction.call(async (trx) => {
    const rowIds = data.rows.map((r) => r.rowId)
    const updatedRows = await trx
      .update(datasetRows)
      .set({ rowData: data.rowData })
      .where(
        and(eq(datasetsV2.id, dataset.id), inArray(datasetRows.id, rowIds)),
      )
      .returning()

    return Result.ok(updatedRows)
  }, db)
}
