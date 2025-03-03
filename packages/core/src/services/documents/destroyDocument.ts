import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { Transaction } from '../../lib'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'

export async function destroyDocument({
  document,
  commit,
  workspace,
  db = database,
}: {
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
  db?: Database
}) {
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
