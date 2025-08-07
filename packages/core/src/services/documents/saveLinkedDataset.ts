import { eq } from 'drizzle-orm'

import type { Dataset, DocumentVersion, LinkedDataset, LinkedDatasetRow } from '../../browser'
import { Result, type TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { documentVersions } from '../../schema'

function getLinkedData({
  inputs,
  datasetRowId,
  mappedInputs,
}: {
  datasetRowId: number | undefined
  inputs: LinkedDataset['inputs'] | LinkedDatasetRow['inputs']
  mappedInputs: Record<string, number | string> | undefined
}) {
  return { inputs, mappedInputs, datasetRowId }
}

function getCurrentDatasetLinkedData({ document }: { document: DocumentVersion }) {
  return document.linkedDatasetAndRow ?? {}
}

type LinkedColumn = Record<number, LinkedDatasetRow>
export async function saveLinkedDataset(
  {
    document,
    dataset,
    data,
  }: {
    document: DocumentVersion
    dataset: Dataset
    data: {
      datasetRowId: number
      mappedInputs: Record<string, number | string> | undefined
      inputs: LinkedDataset['inputs'] | LinkedDatasetRow['inputs']
    }
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  const prevLinkedData = getCurrentDatasetLinkedData({
    document,
  })

  const prevData = prevLinkedData as LinkedColumn
  if (data.datasetRowId === undefined) {
    return Result.error(new Error('Invalid dataset row id'))
  }

  return await transaction.call(async (tx) => {
    const datasetLinkedData = getLinkedData({
      datasetRowId: data.datasetRowId,
      inputs: data.inputs,
      mappedInputs: data.mappedInputs,
    })

    if (datasetLinkedData === undefined) return Result.ok(document)

    const newLinkedData = {
      ...prevData,
      [dataset.id]: {
        ...prevData[dataset.id],
        ...datasetLinkedData,
      },
    }

    const insertData = {
      linkedDatasetAndRow: newLinkedData as LinkedColumn,
    } as Partial<typeof documentVersions.$inferInsert>

    const result = await tx
      .update(documentVersions)
      .set(insertData)
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
