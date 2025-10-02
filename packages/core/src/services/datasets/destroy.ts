import { eq } from 'drizzle-orm'

import { Dataset } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { datasets } from '../../schema/models/datasets'

export async function destroyDataset(
  {
    dataset,
  }: {
    dataset: Dataset
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .update(datasets)
      .set({ deletedAt: new Date() })
      .where(eq(datasets.id, dataset.id))
      .returning()
    const deleted = result[0]!

    return Result.ok(deleted)
  })
}
