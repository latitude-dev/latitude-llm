import { eq } from 'drizzle-orm'

import { DatasetV2 } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { datasetsV2 } from '../../schema'

export async function destroyDataset(
  {
    dataset,
  }: {
    dataset: DatasetV2
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .delete(datasetsV2)
      .where(eq(datasetsV2.id, dataset.id))
      .returning()
    const deleted = result[0]!

    return Result.ok(deleted)
  }, db)
}
