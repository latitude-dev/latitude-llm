import { eq } from 'drizzle-orm'

import { Dataset, DocumentVersion } from '../../browser'
import { database } from '../../client'
import { documentVersions } from '../../schema'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

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
  let data: Record<string, any>
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

  return await Transaction.call(async (tx) => {
    const result = await tx
      .update(documentVersions)
      .set(data)
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  }, trx)
}
