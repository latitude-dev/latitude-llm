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
  let data: Record<string, any>
  if (datasetVersion === DatasetVersion.V1) {
    data = { datasetId: dataset.id }
  } else {
    const existingData = document.linkedDatasetAndRow?.[dataset.id]
    const justDatasetId = { datasetV2Id: dataset.id }

    data = existingData
      ? justDatasetId
      : {
          ...justDatasetId,
          linkedDatasetAndRow: {
            ...document.linkedDatasetAndRow,
            [dataset.id]: {
              datasetRowId: undefined,
              mappedInputs: {},
            },
          },
        }
  }

  return await Transaction.call(async (tx) => {
    const result = await tx
      .update(documentVersions)
      .set(data)
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  }, trx)
}
