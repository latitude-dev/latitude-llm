import { eq } from 'drizzle-orm'

import { Dataset } from '../../browser'
import { database } from '../../client'
import { Result, Transaction, TypedResult } from '../../lib'
import { Column, datasets } from '../../schema'

export async function updateDataset(
  {
    dataset,
    data,
  }: {
    dataset: Dataset
    data: {
      columns: Column[]
    }
  },
  db = database,
): Promise<TypedResult<Omit<Dataset, 'author'>, Error>> {
  return Transaction.call<Omit<Dataset, 'author'>>(async (tx) => {
    const result = await tx
      .update(datasets)
      .set(data)
      .where(eq(datasets.id, dataset.id))
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
