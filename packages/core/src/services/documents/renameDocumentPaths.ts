import { cache } from '../../cache'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { DocumentVersionsRepository } from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { getDataCacheKey } from './getDataCacheKey'
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
    const canEditCheck = await assertCanEditCommit(commit, tx)
    if (canEditCheck.error) return canEditCheck

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

    try {
      const cacheClient = await cache()
      const keys = docsToUpdate.map((document) =>
        getDataCacheKey({
          workspaceId: workspace!.id,
          projectId: commit.projectId,
          commitUuid: commit.uuid,
          documentPath: document.path,
        }),
      )
      if (keys.length > 0) await cacheClient.del(...keys)
    } catch (_error) {
      // Ignore cache errors
    }

    return Result.ok(updatedDocs)
  })
}
