import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import Transaction from '../../lib/Transaction'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'

export async function destroyDocument(
  {
    document,
    commit,
    workspace,
  }: {
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return await transaction.call(async (tx) => {
    const canEditCheck = await assertCanEditCommit(commit, tx)
    if (canEditCheck.error) return canEditCheck

    return destroyOrSoftDeleteDocuments(
      {
        documents: [document],
        commit,
        workspace,
      },
      transaction,
    )
  })
}
