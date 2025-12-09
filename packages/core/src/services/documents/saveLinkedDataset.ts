import { eq } from 'drizzle-orm'

import { type Dataset } from '../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import {
  LinkedDataset,
  LinkedDatasetRow,
} from '../../lib/documentPersistedInputs'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { findWorkspaceFromDocument } from '../../data-access/workspaces'
import { CommitsRepository } from '../../repositories'
import { documentVersions } from '../../schema/models/documentVersions'

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

function getCurrentDatasetLinkedData({
  document,
}: {
  document: DocumentVersion
}) {
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
    // Get workspace and commit to check if it can be edited
    const workspace = await findWorkspaceFromDocument(document, tx)
    if (workspace) {
      const commitsRepo = new CommitsRepository(workspace.id, tx)
      const commitResult = await commitsRepo.getCommitById(document.commitId)
      if (commitResult.ok) {
        const canEditCheck = await assertCanEditCommit(
          commitResult.unwrap(),
          tx,
        )
        if (canEditCheck.error) return canEditCheck
      }
    }

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
