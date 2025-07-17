import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
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
  db = database,
) {
  return Transaction.call(async (tx) => {
    const assertResult = assertCommitIsDraft(commit)
    if (assertResult.error) return assertResult

    return destroyOrSoftDeleteDocuments({
      documents: [document],
      commit,
      workspace,
      trx: tx,
    })
  }, db)
}
