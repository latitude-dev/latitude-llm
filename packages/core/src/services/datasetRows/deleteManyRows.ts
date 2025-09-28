import { and, eq, inArray } from 'drizzle-orm'
import { Dataset, DatasetRow } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { datasetRows } from '../../schema/models/datasetRows'
export const deleteManyRows = async (
  { dataset, rows }: { dataset: Dataset; rows: DatasetRow[] },
  transaction = new Transaction(),
) => {
  return transaction.call(async (trx) => {
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
  })
}
