import { eq } from 'drizzle-orm'

import {
  Dataset,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
} from '../../browser'
import { database } from '../../client'
import { Result, Transaction, TypedResult } from '../../lib'
import { documentVersions } from '../../schema'

export async function assignDataset(
  {
    document,
    dataset,
    datasetVersion,
  }: {
    document: DocumentVersion
    dataset: Dataset | DatasetV2
    datasetVersion: DatasetVersion
  },
  trx = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  const data =
    datasetVersion === DatasetVersion.V1
      ? { datasetId: dataset.id }
      : { datasetV2Id: dataset.id }
  return await Transaction.call(async (tx) => {
    const result = await tx
      .update(documentVersions)
      .set(data)
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  }, trx)
}
