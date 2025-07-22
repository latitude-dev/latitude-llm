import { eq } from 'drizzle-orm'

import { Dataset } from '../../browser'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
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
  transaction = new Transaction(),
): Promise<TypedResult<Omit<Dataset, 'author'>, Error>> {
  return transaction.call<Omit<Dataset, 'author'>>(async (tx) => {
    const result = await tx
      .update(datasets)
      .set(data)
      .where(eq(datasets.id, dataset.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
