import { omit } from 'lodash-es'

import { readMetadata, type CompileError } from '@latitude-data/compiler'
import { database } from '$core/client'
import {
  findCommitById,
  findHeadCommit,
  getDocumentsAtCommit,
  listCommitChanges,
} from '$core/data-access'
import { Result, Transaction, TypedResult } from '$core/lib'
import { ForbiddenError, LatitudeError } from '$core/lib/errors'
import { Commit, DocumentVersion, documentVersions } from '$core/schema'
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

export async function getMergedAndDraftDocuments(
  {
    draft,
  }: {
    draft: Commit
  },
  tx = database,
): Promise<TypedResult<[DocumentVersion[], DocumentVersion[]], Error>> {
  const mergedDocuments: DocumentVersion[] = []

  const headCommit = await findHeadCommit({ projectId: draft.projectId }, tx)
  if (headCommit.ok) {
    // "Head commit" may not exist if the project is empty
    const headDocuments = await getDocumentsAtCommit(
      {
        commitId: headCommit.value!.id,
      },
      tx,
    )
    if (headDocuments.error) return headDocuments
    mergedDocuments.push(...headDocuments.value)
  }

  const draftChanges = await listCommitChanges({ commitId: draft.id }, tx)
  if (draftChanges.error) return Result.error(draftChanges.error)

  const draftDocuments = mergedDocuments
    .filter(
      (d) => !draftChanges.value.find((c) => c.documentUuid === d.documentUuid),
    )
    .concat(draftChanges.value)

  return Result.ok([mergedDocuments, structuredClone(draftDocuments)])
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
}): Promise<{
  documents: DocumentVersion[]
  errors: Record<string, CompileError[]>
}> {
  const errors: Record<string, CompileError[]> = {}

  const getDocumentContent = async (path: string): Promise<string> => {
    const document = newDocuments.find((d) => d.path === path)
    if (!document) {
      throw new Error(`Document not found`)
    }
    return document.content
  }

  const newDocumentsWithUpdatedHash = await Promise.all(
    newDocuments.map(async (d) => {
      const metadata = await readMetadata({
        prompt: d.content ?? '',
        referenceFn: getDocumentContent,
      })
      if (metadata.errors.length > 0) {
        errors[d.documentUuid] = metadata.errors
      }

      return {
        ...d,
        resolvedContent: metadata.resolvedPrompt,
      }
    }),
  )

  const changedDocuments = newDocumentsWithUpdatedHash.filter(
    (newDoc) =>
      !originalDocuments.find(
        (oldDoc) =>
          oldDoc.documentUuid === newDoc.documentUuid &&
          oldDoc.resolvedContent === newDoc.resolvedContent &&
          oldDoc.path === newDoc.path,
      ),
  )

  return { documents: changedDocuments, errors }
}

export async function replaceCommitChanges(
  {
    commitId,
    documentChanges,
  }: {
    commitId: number
    documentChanges: DocumentVersion[]
  },
  tx = database,
): Promise<TypedResult<DocumentVersion[], Error>> {
  return Transaction.call<DocumentVersion[]>(async (trx) => {
    await trx
      .delete(documentVersions)
      .where(eq(documentVersions.commitId, commitId))

    if (documentChanges.length === 0) return Result.ok([])

    const insertedDocuments = await trx
      .insert(documentVersions)
      .values(
        documentChanges.map((d) => ({
          ...omit(d, ['id', 'commitId', 'updatedAt']),
          commitId,
        })),
      )
      .returning()

    return Result.ok(insertedDocuments)
  }, tx)
}
