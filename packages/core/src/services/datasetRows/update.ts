import { and, eq } from 'drizzle-orm'
import { DatasetV2 } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { DatasetRowData, datasetRows } from '../../schema'

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
    const updatedRows: (typeof datasetRows.$inferSelect)[] = []

    for (const row of data.rows) {
      const result = await trx
        .update(datasetRows)
        .set({ rowData: row.rowData })
        .where(
          and(
            eq(datasetRows.id, row.rowId),
            eq(datasetRows.datasetId, dataset.id),
          ),
        )
        .returning()

      const updatedRow = result[0]!
      updatedRows.push(updatedRow)
    }

    return Result.ok(updatedRows)
  }, db)
}
