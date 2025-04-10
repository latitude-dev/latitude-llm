import { eq } from 'drizzle-orm'

import { Dataset } from '../../browser'
import { database } from '../../client'
import { Column, datasets } from '../../schema'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

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
