import { eq } from 'drizzle-orm'

import type { Dataset, DocumentVersion } from '../../browser'
import { Result, type TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { documentVersions } from '../../schema'

export async function assignDataset(
  {
    document,
    dataset,
  }: {
    document: DocumentVersion
    dataset: Dataset
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  const existingData = document.linkedDatasetAndRow?.[dataset.id]
  const justDatasetId = { datasetV2Id: dataset.id }
  const data = existingData
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

  return await transaction.call(async (tx) => {
    const result = await tx
      .update(documentVersions)
      .set(data as Record<string, any>)
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
