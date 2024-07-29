import { database, Database } from '$core/client'
import { NotFoundError, Result, Transaction } from '$core/lib'
import { DocumentVersionsRepository } from '$core/repositories'
import { Commit, DocumentVersion } from '$core/schema'
import { destroyOrSoftDeleteDocuments } from '$core/services/documents/destroyOrSoftDeleteDocuments'
import { assertCommitIsDraft } from '$core/services/documents/utils'

export async function destroyDocument({
  document,
  commit,
  workspaceId,
  db = database,
}: {
  document: DocumentVersion
  commit: Commit
  workspaceId: number
  db?: Database
}) {
  return Transaction.call(async (tx) => {
    const assertResult = assertCommitIsDraft(commit)
    assertResult.unwrap()

    const docsScope = new DocumentVersionsRepository(workspaceId)
    const documents = (await docsScope.getDocumentsAtCommit(commit)).unwrap()
    const doc = documents.find((d) => d.documentUuid === document.documentUuid)

    if (!doc) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    return destroyOrSoftDeleteDocuments({
      documents: [doc],
      commit,
      trx: tx,
    })
  }, db)
}
