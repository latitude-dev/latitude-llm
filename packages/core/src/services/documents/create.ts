import { findCommitById, getDocumentsAtCommit } from '$core/data-access'
import { Result, Transaction, TypedResult } from '$core/lib'
import { BadRequestError } from '$core/lib/errors'
import { DocumentVersion, documentVersions } from '$core/schema'

export async function createNewDocument({
  commitId,
  path,
  content,
}: {
  commitId: number
  path: string
  content?: string
}): Promise<TypedResult<DocumentVersion, Error>> {
  return await Transaction.call(async (tx) => {
    const commit = (await findCommitById({ id: commitId }, tx)).unwrap()
    if (commit.mergedAt !== null) {
      return Result.error(new BadRequestError('Cannot modify a merged commit'))
    }

    const currentDocs = (await getDocumentsAtCommit({ commitId }, tx)).unwrap()
    if (currentDocs.find((d) => d.path === path)) {
      return Result.error(
        new BadRequestError('A document with the same path already exists'),
      )
    }

    const newDoc = await tx
      .insert(documentVersions)
      .values({
        commitId,
        path,
        content: content ?? '',
      })
      .returning()

    return Result.ok(newDoc[0]!)
  })
}
