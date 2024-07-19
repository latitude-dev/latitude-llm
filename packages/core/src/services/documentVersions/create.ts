import {
  DocumentVersion,
  documentVersions,
  findCommit,
  Result,
  Transaction,
} from '@latitude-data/core'
import { ForbiddenError } from '$core/lib/errors'

function createDocument({
  path,
  commitId,
  documentUuid,
  content,
}: {
  path: string
  commitId: number
  content: string
  documentUuid?: string
}) {
  return Transaction.call<DocumentVersion>(async (tx) => {
    const result = await tx
      .insert(documentVersions)
      .values({
        path,
        commitId,
        documentUuid,
        content,
      })
      .returning()
    const documentVersion = result[0]
    return Result.ok(documentVersion!)
  })
}

export async function createDocumentVersion({
  documentUuid,
  projectId,
  path,
  commitUuid,
  content,
}: {
  documentUuid?: string
  projectId: number
  path: string
  commitUuid: string
  content?: string
}) {
  const resultFindCommit = await findCommit({ uuid: commitUuid, projectId })

  if (resultFindCommit.error) return resultFindCommit

  const commit = resultFindCommit.value

  if (commit.mergedAt !== null) {
    return Result.error(
      new ForbiddenError('Cannot create a document version in a merged commit'),
    )
  }

  return createDocument({
    documentUuid,
    path,
    commitId: commit.id,
    content: content ?? '',
  })
}
