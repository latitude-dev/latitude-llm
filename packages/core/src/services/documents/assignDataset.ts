import { eq } from 'drizzle-orm'

import { Dataset, DocumentVersion } from '../../browser'
import { database } from '../../client'
import { Result, Transaction, TypedResult } from '../../lib'
import { documentVersions } from '../../schema'

export async function assignDataset(
  {
    document,
    dataset,
  }: {
    document: DocumentVersion
    dataset: Dataset
  },
  trx = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  return await Transaction.call(async (tx) => {
    const result = await tx
      .update(documentVersions)
      .set({ datasetId: dataset.id })
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  }, trx)
}
