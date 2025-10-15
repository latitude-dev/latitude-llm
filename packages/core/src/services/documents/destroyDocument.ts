import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
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
