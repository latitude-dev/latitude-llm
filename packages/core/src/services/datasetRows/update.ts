import { and, eq } from 'drizzle-orm'
import { Dataset } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetRowData, datasetRows } from '../../schema'
export const updateDatasetRow = async (
  {
    dataset,
    data,
  }: {
    dataset: Dataset
    data: {
      rows: {
        rowId: number
        rowData: DatasetRowData
      }[]
    }
  },
  transaction = new Transaction(),
) => {
  return transaction.call(async (trx) => {
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
  })
}
