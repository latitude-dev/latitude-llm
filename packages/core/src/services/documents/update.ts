import { omit } from 'lodash-es'

import { database } from '$core/client'
import { findWorkspaceFromCommit } from '$core/data-access'
import { Result, Transaction, TypedResult } from '$core/lib'
import { BadRequestError, NotFoundError } from '$core/lib/errors'
import { DocumentVersionsRepository } from '$core/repositories'
import { Commit, DocumentVersion, documentVersions } from '$core/schema'
import { assertCommitIsDraft } from '$core/services/documents/utils'
import { eq } from 'drizzle-orm'

// TODO: refactor, can be simplified
export async function updateDocument(
  {
    commit,
    document,
    path,
    content,
  }: {
    commit: Commit
    document: DocumentVersion
    path?: string
    content?: string | null
  },
  trx = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  return await Transaction.call(async (tx) => {
    const updatedDocData = Object.fromEntries(
      Object.entries({ path, content }).filter(([_, v]) => v !== undefined),
    )

    const asertResult = assertCommitIsDraft(commit)
    asertResult.unwrap()

    if (commit.mergedAt !== null) {
      return Result.error(new BadRequestError('Cannot modify a merged commit'))
    }

    const workspace = await findWorkspaceFromCommit(commit, tx)
    const docsScope = new DocumentVersionsRepository(workspace!.id, tx)
    const documents = (
      await docsScope.getDocumentsAtCommit({ commit })
    ).unwrap()
    const doc = documents.find((d) => d.documentUuid === document.documentUuid)

    if (!doc) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    if (path !== undefined) {
      if (
        documents.find(
          (d) => d.path === path && d.documentUuid !== doc.documentUuid,
        )
      ) {
        return Result.error(
          new BadRequestError('A document with the same path already exists'),
        )
      }
    }

    const oldVersion = omit(document, ['id', 'commitId', 'updatedAt'])

    const newVersion = {
      ...oldVersion,
      ...updatedDocData,
      commitId: commit.id,
    }

    const updatedDocs = await tx
      .insert(documentVersions)
      .values(newVersion)
      .onConflictDoUpdate({
        target: [documentVersions.documentUuid, documentVersions.commitId],
        set: newVersion,
      })
      .returning()
    if (updatedDocs.length === 0) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, commit.id))

    return Result.ok(updatedDocs[0]!)
  }, trx)
}
