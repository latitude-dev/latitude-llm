import { omit } from 'lodash-es'

import { readMetadata, type CompileError } from '@latitude-data/compiler'
import { database } from '$core/client'
import { findWorkspaceFromCommit } from '$core/data-access'
import { Result, Transaction, TypedResult } from '$core/lib'
import { BadRequestError } from '$core/lib/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '$core/repositories'
import { Commit, DocumentVersion, documentVersions } from '$core/schema'
import { eq } from 'drizzle-orm'

export async function getMergedAndDraftDocuments(
  {
    draft,
  }: {
    draft: Commit
  },
  tx = database,
): Promise<TypedResult<[DocumentVersion[], DocumentVersion[]], Error>> {
  const mergedDocuments: DocumentVersion[] = []

  const workspace = await findWorkspaceFromCommit(draft, tx)
  const commitsScope = new CommitsRepository(workspace!.id, tx)
  const docsScope = new DocumentVersionsRepository(workspace!.id, tx)
  const projectsScope = new ProjectsRepository(workspace!.id, tx)
  const projectResult = await projectsScope.getProjectById(draft.projectId)
  if (projectResult.error) return projectResult

  const headCommitResult = await commitsScope.getHeadCommit(
    projectResult.value!,
  )
  if (headCommitResult.error) return headCommitResult

  const headDocumentsResult = await docsScope.getDocumentsAtCommit({
    commit: headCommitResult.value,
  })
  if (headDocumentsResult.error) return Result.error(headDocumentsResult.error)

  mergedDocuments.push(...headDocumentsResult.value)

  const draftChangesResult = await docsScope.listCommitChanges(draft)
  if (draftChangesResult.error) return Result.error(draftChangesResult.error)

  const draftDocuments = mergedDocuments
    .filter(
      (d) =>
        !draftChangesResult.value.find(
          (c) => c.documentUuid === d.documentUuid,
        ),
    )
    .concat(draftChangesResult.value)

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

export function assertCommitIsDraft(commit: Commit) {
  if (commit.mergedAt !== null) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }
  return Result.ok(true)
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

// TODO: replace commitId param with commit object
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
