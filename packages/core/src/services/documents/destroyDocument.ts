import { Commit, DocumentVersion } from '$core/browser'
import { database, Database } from '$core/client'
import { Transaction } from '$core/lib'
import { assertCommitIsDraft } from '$core/lib/assertCommitIsDraft'
import { destroyOrSoftDeleteDocuments } from '$core/services/documents/destroyOrSoftDeleteDocuments'

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
