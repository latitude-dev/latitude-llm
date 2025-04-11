import { eq } from 'drizzle-orm'

import { Dataset } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { datasets } from '../../schema'

export async function destroyDataset(
  {
    dataset,
  }: {
    dataset: Dataset
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .delete(datasets)
      .where(eq(datasets.id, dataset.id))
      .returning()
    const deleted = result[0]!

    return Result.ok(deleted)
  }, db)
}
