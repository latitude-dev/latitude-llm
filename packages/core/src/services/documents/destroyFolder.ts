import type { Commit } from '../../browser'
import { database, Database } from '../../client'
import { NotFoundError, Result, Transaction } from '../../lib'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { DocumentVersionsRepository } from '../../repositories/documentVersionsRepository'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'

export async function destroyFolder({
  path,
  commit,
  workspaceId,
  db = database,
}: {
  path: string
  commit: Commit
  workspaceId: number
  db?: Database
}) {
  return Transaction.call(async (tx) => {
    const assertResult = assertCommitIsDraft(commit)
    assertResult.unwrap()

    const docsScope = new DocumentVersionsRepository(workspaceId, tx)
    const allDocuments = (await docsScope.getDocumentsAtCommit(commit)).unwrap()

    const folderPath = path.endsWith('/') ? path : `${path}/`
    const documents = allDocuments.filter((d) => d.path.startsWith(folderPath))

    if (documents.length === 0) {
      return Result.error(new NotFoundError('Folder does not exist'))
    }

    return destroyOrSoftDeleteDocuments({
      documents,
      commit,
      trx: tx,
    })
  }, db)
}
