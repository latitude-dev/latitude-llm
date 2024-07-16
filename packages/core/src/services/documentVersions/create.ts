import {
  DocumentVersion,
  documentVersions,
  findCommit,
  Result,
  Transaction,
  type DocumentType,
} from '@latitude-data/core'

import createCommit from '../commits/create'

function createDocument({
  name,
  commitId,
  parentId,
  documentType,
}: {
  name: string
  commitId: number
  parentId?: number
  documentType?: DocumentType
}) {
  return Transaction.call<DocumentVersion>(async (tx) => {
    const result = await tx
      .insert(documentVersions)
      .values({
        name,
        commitId,
        parentId,
        documentType,
      })
      .returning()
    const documentVersion = result[0]
    return Result.ok(documentVersion!)
  })
}

export async function createDocumentVersion({
  projectId,
  name,
  commitUuid,
  documentType,
  parentId,
}: {
  projectId: number
  name: string
  commitUuid: string
  documentType?: DocumentType
  parentId?: number
}) {
  let commit = await findCommit({ uuid: commitUuid })
  return Transaction.call<DocumentVersion>(async (tx) => {
    if (!commit) {
      const resultCommit = await createCommit({ projectId, db: tx })
      if (resultCommit.error) return resultCommit

      commit = resultCommit.value
    }

    return createDocument({
      name,
      commitId: commit.id,
      parentId,
      documentType,
    })
  })
}
