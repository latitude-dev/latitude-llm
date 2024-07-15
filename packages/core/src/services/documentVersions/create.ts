import {
  DocumentVersion,
  documentVersions,
  findCommit,
  Result,
  Transaction,
  type DocumentType,
} from '@latitude-data/core'
import { ForbiddenError } from '$core/lib/errors'

function createDocument({
  name,
  commitId,
  parentId,
  documentType,
  documentUuid,
  content,
}: {
  name: string
  commitId: number
  parentId?: number
  documentType?: DocumentType
  documentUuid?: string
  content?: string
}) {
  return Transaction.call<DocumentVersion>(async (tx) => {
    const result = await tx
      .insert(documentVersions)
      .values({
        name,
        commitId,
        parentId,
        documentType,
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
  name,
  commitUuid,
  documentType,
  parentId,
  content,
}: {
  documentUuid?: string
  projectId: number
  name: string
  commitUuid: string
  documentType?: DocumentType
  parentId?: number
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
    name,
    commitId: commit.id,
    parentId,
    documentType,
    content,
  })
}
