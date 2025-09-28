import { Commit, DocumentVersion, Workspace } from '../../schema/types'
import Transaction from '../../lib/Transaction'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
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
  const assertResult = assertCommitIsDraft(commit)
  if (assertResult.error) return assertResult

  return destroyOrSoftDeleteDocuments(
    {
      documents: [document],
      commit,
      workspace,
    },
    transaction,
  )
}
