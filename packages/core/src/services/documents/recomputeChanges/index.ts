import path from 'path'
import { omit } from 'lodash-es'

import {
  readMetadata,
  Document as RefDocument,
  type CompileError,
} from '@latitude-data/compiler'
import { Commit, DocumentVersion } from '$core/browser'
import { database } from '$core/client'
import { Result, Transaction, TypedResult } from '$core/lib'
import { assertCommitIsDraft } from '$core/lib/assertCommitIsDraft'
import { documentVersions } from '$core/schema'
import { eq } from 'drizzle-orm'

import { getHeadDocumentsAndDraftDocumentsForCommit } from './getHeadDocumentsAndDraftDocuments'
import { getMergedAndDraftDocuments } from './getMergedAndDraftDocuments'

async function resolveDocumentChanges({
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

  const getDocumentContent = async (
    refPath: string,
    from?: string,
  ): Promise<RefDocument | undefined> => {
    const fullPath = path
      .resolve(path.dirname(`/${from ?? ''}`), refPath)
      .replace(/^\//, '')
    const document = newDocuments.find((d) => d.path === fullPath)
    if (!document) return undefined
    return {
      path: document.path,
      content: document.content,
    }
  }

  const newDocumentsWithUpdatedHash = await Promise.all(
    newDocuments.map(async (d) => {
      const metadata = await readMetadata({
        prompt: d.content ?? '',
        fullPath: d.path,
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
          oldDoc.path === newDoc.path &&
          oldDoc.deletedAt === newDoc.deletedAt,
      ),
  )

  return { documents: changedDocuments, errors }
}
async function replaceCommitChanges(
  {
    commit,
    documentChanges,
  }: {
    commit: Commit
    documentChanges: DocumentVersion[]
  },
  tx = database,
): Promise<TypedResult<DocumentVersion[], Error>> {
  const commitId = commit.id
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

export type RecomputedChanges = {
  changedDocuments: DocumentVersion[]
  headDocuments: DocumentVersion[]
  errors: { [documentUuid: string]: CompileError[] }
}

export async function recomputeChanges(
  {
    draft,
    workspaceId,
  }: {
    draft: Commit
    workspaceId: number
  },
  tx = database,
): Promise<TypedResult<RecomputedChanges, Error>> {
  try {
    assertCommitIsDraft(draft).unwrap()

    const result = await getHeadDocumentsAndDraftDocumentsForCommit(
      { commit: draft, workspaceId },
      tx,
    )
    if (result.error) return result

    const { headDocuments, documentsInDrafCommit } = result.value
    const { mergedDocuments, draftDocuments } = getMergedAndDraftDocuments({
      headDocuments,
      documentsInDrafCommit,
    })

    const { documents: documentsToUpdate, errors } =
      await resolveDocumentChanges({
        originalDocuments: mergedDocuments,
        newDocuments: draftDocuments,
      })

    const newDraftDocuments = (
      await replaceCommitChanges(
        {
          commit: draft,
          documentChanges: documentsToUpdate,
        },
        tx,
      )
    ).unwrap()

    return Result.ok({
      headDocuments: mergedDocuments,
      changedDocuments: newDraftDocuments,
      errors,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
