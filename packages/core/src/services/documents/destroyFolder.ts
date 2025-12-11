import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories/documentVersionsRepository'
import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { destroyOrSoftDeleteDocuments } from './destroyOrSoftDeleteDocuments'

export async function destroyFolder(
  {
    path,
    commit,
    workspace,
  }: {
    path: string
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const canEditCheck = await assertCanEditCommit(commit, tx)
    if (canEditCheck.error) return canEditCheck

    const docsScope = new DocumentVersionsRepository(workspace.id, tx)
    const allDocuments = (await docsScope.getDocumentsAtCommit(commit)).unwrap()

    const folderPath = path.endsWith('/') ? path : `${path}/`
    const documents = allDocuments.filter((d) => d.path.startsWith(folderPath))

    if (documents.length === 0) {
      return Result.error(new NotFoundError('Folder does not exist'))
    }

    return destroyOrSoftDeleteDocuments(
      {
        documents,
        commit,
        workspace,
      },
      transaction,
    )
  })
}
