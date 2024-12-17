import { eq } from 'drizzle-orm'

import { Dataset, DocumentVersion, LinkedDataset } from '../../browser'
import { database } from '../../client'
import { Result, Transaction, TypedResult } from '../../lib'
import { documentVersions } from '../../schema'

export async function saveLinkedDataset(
  {
    document,
    dataset,
    data,
  }: {
    document: DocumentVersion
    dataset: Dataset
    data: {
      rowIndex: number
      inputs: LinkedDataset['inputs']
      mappedInputs: LinkedDataset['mappedInputs']
    }
  },
  trx = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  const prevLinked = document.linkedDataset ?? {}

  return await Transaction.call(async (tx) => {
    const linkedDataset = {
      ...prevLinked,
      [dataset.id]: {
        rowIndex: data.rowIndex,
        inputs: data.inputs,
        mappedInputs: data.mappedInputs,
      },
    }
    const result = await tx
      .update(documentVersions)
      .set({ linkedDataset })
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  }, trx)
}
