import { and, eq } from 'drizzle-orm'

import { type Commit } from '../../browser'
import { database } from '../../client'
import { documentVersions } from '../../schema'
import { createNewDocument } from '../../services/documents/create'
import { updateDocument } from '../../services/documents/update'

export type IDocumentVersionData = {
  commit: Commit
  path: string
  content: string
  deletedAt?: Date
}

export async function markAsSoftDelete(
  { commitId, documentUuid }: { commitId: number; documentUuid: string },
  tx = database,
) {
  return tx
    .update(documentVersions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(documentVersions.documentUuid, documentUuid),
        eq(documentVersions.commitId, commitId),
      ),
    )
}

export async function createDocumentVersion(data: IDocumentVersionData) {
  let result = await createNewDocument({
    commit: data.commit,
    path: data.path,
  })

  if (data.content) {
    result = await updateDocument({
      commit: data.commit,
      document: result.unwrap(),
      content: data.content,
      deletedAt: data.deletedAt,
    })
  }

  const documentVersion = result.unwrap()

  return { documentVersion }
}
