import { eq } from 'drizzle-orm'

import { DatasetV2 } from '../../browser'
import { database } from '../../client'
import { Result, Transaction, TypedResult } from '../../lib'
import { Column, datasetsV2 } from '../../schema'

export async function updateDataset(
  {
    dataset,
    data,
  }: {
    dataset: DatasetV2
    data: {
      columns: Column[]
    }
  },
  db = database,
): Promise<TypedResult<Omit<DatasetV2, 'author'>, Error>> {
  return Transaction.call<Omit<DatasetV2, 'author'>>(async (tx) => {
    const result = await tx
      .update(datasetsV2)
      .set(data)
      .where(eq(datasetsV2.id, dataset.id))
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
