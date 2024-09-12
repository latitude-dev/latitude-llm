import { eq } from 'drizzle-orm'

import { Dataset } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { datasets } from '../../schema'

export async function destroyDataset(
  {
    dataset,
    disk = diskFactory(),
  }: {
    dataset: Dataset
    disk?: DiskWrapper
  },
  db = database,
) {
  const deleteResult = await disk.delete(dataset.fileKey)
  if (deleteResult.error) return deleteResult

  return Transaction.call(async (tx) => {
    const result = await tx
      .delete(datasets)
      .where(eq(datasets.id, dataset.id))
      .returning()
    const deleted = result[0]!

    return Result.ok(deleted)
  }, db)
}
