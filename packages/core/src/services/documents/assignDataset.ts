import { eq } from 'drizzle-orm'

import { type Dataset } from '../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { findWorkspaceFromDocument } from '../../data-access/workspaces'
import { CommitsRepository } from '../../repositories'
import { documentVersions } from '../../schema/models/documentVersions'

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

    const result = await tx
      .update(documentVersions)
      .set(data as Record<string, any>)
      .where(eq(documentVersions.id, document.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
