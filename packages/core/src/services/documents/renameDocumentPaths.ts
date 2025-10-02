import type { Commit, DocumentVersion } from '../../schema/types'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { updateDocument } from './update'

export async function renameDocumentPaths(
  {
    commit,
    oldPath,
    newPath,
  }: {
    commit: Commit
    oldPath: string
    newPath: string
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion[], Error>> {
  return await transaction.call(async (tx) => {
    if (commit.mergedAt !== null) {
      return Result.error(new BadRequestError('Cannot modify a merged commit'))
    }

    if (oldPath.endsWith('/') !== newPath.endsWith('/')) {
      return Result.error(
        new BadRequestError(
          'Trying to rename a folder as a document or vice versa',
        ),
      )
    }

    const workspace = await findWorkspaceFromCommit(commit, tx)
    const docsScope = new DocumentVersionsRepository(workspace!.id, tx)

    const currentDocs = await docsScope
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())

    const docsToUpdate = currentDocs.filter((d) =>
      oldPath.endsWith('/') ? d.path.startsWith(oldPath) : d.path === oldPath,
    )

    const updatedDocs = await Promise.all(
      docsToUpdate.map(async (document) => {
        const updatedPath = newPath + document.path.slice(oldPath.length)
        // A simple replace would also replace other instances of oldPath in the path
        // For example, relpacing "a" to "b" in "a/name" would result in "b/nbme"
        const updatedDoc = await updateDocument(
          {
            commit,
            document,
            path: updatedPath,
          },
          transaction,
        )
        return updatedDoc.unwrap()
      }),
    )

    return Result.ok(updatedDocs)
  })
}
