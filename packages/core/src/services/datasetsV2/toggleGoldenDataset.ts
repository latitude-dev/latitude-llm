import { eq } from 'drizzle-orm'

import { DatasetV2 } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { datasetsV2 } from '../../schema'

export async function toggleGoldenDataset(
  {
    dataset,
  }: {
    dataset: DatasetV2
  },
  db = database,
) {
  return Transaction.call<DatasetV2>(async (tx) => {
    const result = await tx
      .update(datasetsV2)
      .set({ isGolden: dataset.isGolden ? false : true })
      .where(eq(datasetsV2.id, dataset.id))
      .returning()

    return Result.ok(result[0]! as DatasetV2)
  }, db)
}
