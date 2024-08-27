import { Commit, DocumentVersion } from '../../browser'
import { database, Database } from '../../client'
import { Transaction } from '../../lib'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'

export async function destroyDocument({
  document,
  commit,
  db = database,
}: {
  document: DocumentVersion
  commit: Commit
  db?: Database
}) {
  return Transaction.call(async (tx) => {
    const assertResult = assertCommitIsDraft(commit)
    if (assertResult.error) return assertResult

    return destroyOrSoftDeleteDocuments({
      documents: [document],
      commit,
      trx: tx,
    })
  }, db)
}
