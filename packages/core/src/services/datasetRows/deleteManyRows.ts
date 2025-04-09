import { and, eq, inArray } from 'drizzle-orm'
import { Dataset, DatasetRow } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { datasetRows } from '../../schema'

export const deleteManyRows = async (
  { dataset, rows }: { dataset: Dataset; rows: DatasetRow[] },
  db = database,
) => {
  return Transaction.call(async (trx) => {
    if (rows.length === 0) return Result.ok([])

    const rowIds = rows.map((row) => row.id)
    const deletedRows = await trx
      .delete(datasetRows)
      .where(
        and(
          eq(datasetRows.datasetId, dataset.id),
          inArray(datasetRows.id, rowIds),
        ),
      )
      .returning()

    return Result.ok(deletedRows)
  }, db)
}
