import { and, eq } from 'drizzle-orm'

import {
  DocumentVersion,
  LinkedDataset,
  User,
  Workspace,
  type Commit,
} from '../../browser'
import { database } from '../../client'
import { documentVersions } from '../../schema'
import { destroyDocument } from '../../services/documents'
import { createNewDocument } from '../../services/documents/create'
import { updateDocument } from '../../services/documents/update'

export type IDocumentVersionData = {
  commit: Commit
  path: string
  content: string
  deletedAt?: Date
}

export async function markAsSoftDelete(
  { documentUuid, commitId }: { documentUuid: string; commitId: number },
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

export async function createDocumentVersion(
  data: IDocumentVersionData & { workspace: Workspace; user: User },
  tx = database,
) {
  let result = await createNewDocument({
    workspace: data.workspace,
    user: data.user,
    commit: data.commit,
    path: data.path,
  })

  const doc = result.unwrap()

  if (data.content) {
    result = await updateDocument({
      commit: data.commit,
      document: doc,
      content: data.content,
      deletedAt: data.deletedAt,
    })
  }

  // Fetch created or updated document from db because createNewDocument and
  // updateDocument perform 2 updates but return the state of the first one
  const documentData = result.unwrap()
  const document = (
    await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentUuid, documentData.documentUuid),
          eq(documentVersions.commitId, data.commit.id),
        ),
      )
  )[0]!

  return { documentVersion: document }
}

export async function updateDocumentVersion(
  {
    document,
    commit,
    path,
    content,
  }: {
    document: DocumentVersion
    commit: Commit
    path?: string
    content?: string
    datasetId?: number
    linkedDataset?: Record<number, LinkedDataset>
  },
  tx = database,
) {
  await updateDocument({
    commit,
    document,
    path,
    content,
  }).then((result) => result.unwrap())

  // Fetch updated document from db because updateDocument performs
  // 2 updates but returns the state of the first one
  const updatedDocument = (
    await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentUuid, document.documentUuid),
          eq(documentVersions.commitId, commit.id),
        ),
      )
  )[0]!

  return updatedDocument
}

export async function destroyDocumentVersion(
  {
    document,
    commit,
    workspace,
  }: {
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  tx = database,
) {
  await destroyDocument({ document, commit, workspace }).then((r) => r.unwrap())

  // Fetch destroyed document from db because destroyDocument does
  // not return it. Note, it can be undefined when hard deleted
  const destroyedDocument = (
    await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentUuid, document.documentUuid),
          eq(documentVersions.commitId, commit.id),
        ),
      )
  )[0]

  return destroyedDocument
}
