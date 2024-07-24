import { omit } from 'lodash-es'

import { findCommitById, getDocumentsAtCommit } from '$core/data-access'
import { Result, Transaction, TypedResult } from '$core/lib'
import { BadRequestError, NotFoundError } from '$core/lib/errors'
import { DocumentVersion, documentVersions } from '$core/schema'

export async function updateDocument({
  commitId,
  documentUuid,
  path,
  content,
  deletedAt,
}: {
  commitId: number
  documentUuid: string
  path?: string
  content?: string | null
  deletedAt?: Date | null
}): Promise<TypedResult<DocumentVersion, Error>> {
  const updatedDocData = Object.fromEntries(
    Object.entries({ path, content, deletedAt }).filter(
      ([_, v]) => v !== undefined,
    ),
  )

  return await Transaction.call(async (tx) => {
    const commit = (await findCommitById({ id: commitId }, tx)).unwrap()
    if (commit.mergedAt !== null) {
      return Result.error(new BadRequestError('Cannot modify a merged commit'))
    }
    const currentDocs = (await getDocumentsAtCommit({ commitId }, tx)).unwrap()
    const currentDoc = currentDocs.find((d) => d.documentUuid === documentUuid)

    if (!currentDoc) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    if (path !== undefined) {
      if (
        currentDocs.find(
          (d) => d.path === path && d.documentUuid !== documentUuid,
        )
      ) {
        return Result.error(
          new BadRequestError('A document with the same path already exists'),
        )
      }
    }

    const oldVersion = omit(currentDoc, ['id', 'commitId', 'updatedAt'])

    const newVersion = {
      ...oldVersion,
      ...updatedDocData,
      commitId,
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

    return Result.ok(updatedDocs[0]!)
  })
}
