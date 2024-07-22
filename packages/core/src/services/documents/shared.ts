import { omit } from 'lodash-es'

import { readMetadata } from '@latitude-data/compiler'
import {
  Commit,
  DocumentVersion,
  documentVersions,
  findCommitById,
  findHeadCommit,
  getDocumentsAtCommit,
  listCommitChanges,
  Result,
  Transaction,
  TypedResult,
} from '@latitude-data/core'
import { ForbiddenError, LatitudeError } from '$core/lib/errors'
import { eq } from 'drizzle-orm'

export async function getDraft(
  commitId: number,
): Promise<TypedResult<Commit, LatitudeError>> {
  const commit = await findCommitById({ id: commitId })

  if (commit.value?.mergedAt !== null) {
    return Result.error(
      new ForbiddenError('Cannot create a document version in a merged commit'),
    )
  }

  return Result.ok(commit.value!)
}

export async function getMergedAndDraftDocuments({
  draft,
}: {
  draft: Commit
}): Promise<TypedResult<[DocumentVersion[], DocumentVersion[]], Error>> {
  const headCommit = await findHeadCommit({ projectId: draft.projectId })
  if (headCommit.error) return headCommit

  const mergedDocuments = await getDocumentsAtCommit({
    commitId: headCommit.value.id,
  })
  if (mergedDocuments.error) return mergedDocuments

  const draftChanges = await listCommitChanges({ commitId: draft.id })
  if (draftChanges.error) return Result.error(draftChanges.error)

  const draftDocuments = mergedDocuments.value
    .filter(
      (d) => !draftChanges.value.find((c) => c.documentUuid === d.documentUuid),
    )
    .concat(draftChanges.value)

  return Result.ok([mergedDocuments.value, structuredClone(draftDocuments)])
}

export function existsAnotherDocumentWithSamePath({
  documents,
  path,
}: {
  documents: DocumentVersion[]
  path: string
}) {
  return documents.find((d) => d.path === path) !== undefined
}

export async function resolveDocumentChanges({
  originalDocuments,
  newDocuments,
}: {
  originalDocuments: DocumentVersion[]
  newDocuments: DocumentVersion[]
}): Promise<DocumentVersion[]> {
  const getDocumentContent = async (path: string): Promise<string> => {
    const document = newDocuments.find((d) => d.path === path)
    if (!document) {
      throw new Error(`Document not found`)
    }
    return document.content
  }

  const newDocumentsWithUpdatedHash = await Promise.all(
    newDocuments.map(async (d) => ({
      ...d,
      hash: await readMetadata({
        prompt: d.content ?? '',
        referenceFn: getDocumentContent,
      }).then((m) => m.hash),
    })),
  )

  return newDocumentsWithUpdatedHash.filter(
    (newDoc) =>
      !originalDocuments.find(
        (oldDoc) =>
          oldDoc.documentUuid === newDoc.documentUuid &&
          oldDoc.hash === newDoc.hash &&
          oldDoc.path === newDoc.path,
      ),
  )
}

export async function replaceCommitChanges({
  commitId,
  documentChanges,
}: {
  commitId: number
  documentChanges: DocumentVersion[]
}): Promise<TypedResult<DocumentVersion[], Error>> {
  return Transaction.call<DocumentVersion[]>(async (tx) => {
    await tx
      .delete(documentVersions)
      .where(eq(documentVersions.commitId, commitId))

    if (documentChanges.length === 0) return Result.ok([])

    const insertedDocuments = await tx
      .insert(documentVersions)
      .values(
        documentChanges.map((d) => ({
          ...omit(d, ['id', 'commitId', 'updatedAt']),
          commitId,
        })),
      )
      .returning()

    return Result.ok(insertedDocuments)
  })
}
