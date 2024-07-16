import {
  DocumentVersion,
  documentVersions,
  findCommit,
  Result,
  Transaction,
  type DocumentType,
} from '@latitude-data/core'

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
  const res = await findCommit({ commitUuid, projectId })
  let commitId = res.unwrap()

  return createDocument({
    documentUuid,
    name,
    commitId: commitId,
    parentId,
    documentType,
    content,
  })
}
