import {
  Commit,
  DocumentVersion,
  ModifiedDocumentType,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import type { CompileError } from 'promptl-ai'
import { recomputeChanges } from '../documents'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'
import { ChangedDocument } from '@latitude-data/constants'

type DocumentErrors = { [documentUuid: string]: CompileError[] }

const byErrors =
  (errors: DocumentErrors) => (a: DocumentVersion, b: DocumentVersion) => {
    const aErrors = errors[a.documentUuid]?.length ?? 0
    const bErrors = errors[b.documentUuid]?.length ?? 0
    return bErrors - aErrors
  }

export function changesPresenter({
  currentCommitChanges,
  previousCommitDocuments,
  errors,
}: {
  currentCommitChanges: DocumentVersion[]
  previousCommitDocuments: DocumentVersion[]
  errors: DocumentErrors
}): ChangedDocument[] {
  return currentCommitChanges.sort(byErrors(errors)).map((changedDoc) => {
    const changeType = (() => {
      const previousDoc = previousCommitDocuments.find(
        (doc) => doc.documentUuid === changedDoc.documentUuid,
      )
      if (!previousDoc) {
        return ModifiedDocumentType.Created
      }
      if (changedDoc.deletedAt) {
        return ModifiedDocumentType.Deleted
      }
      if (previousDoc!.path !== changedDoc.path) {
        return ModifiedDocumentType.UpdatedPath
      }
      return ModifiedDocumentType.Updated
    })()

    return {
      documentUuid: changedDoc.documentUuid,
      path: changedDoc.path,
      errors: errors[changedDoc.documentUuid]?.length ?? 0,
      changeType,
    }
  })
}

async function getDraftChanges(
  { workspace, draft }: { workspace: Workspace; draft: Commit },
  db = database,
): PromisedResult<ChangedDocument[]> {
  const result = await recomputeChanges({ draft, workspace }, db)
  if (result.error) return result
  const changes = result.value

  // Include documents with errors on `changes.changedDocuments`
  for (const documentUuid of Object.keys(changes.errors)) {
    if (
      changes.changedDocuments.some((doc) => doc.documentUuid === documentUuid)
    ) {
      continue
    }

    const document = changes.headDocuments.find(
      (doc) => doc.documentUuid === documentUuid,
    )
    if (!document) {
      continue
    }

    changes.changedDocuments.push(document)
  }

  return Result.ok(
    changesPresenter({
      currentCommitChanges: changes.changedDocuments,
      previousCommitDocuments: changes.headDocuments,
      errors: changes.errors as DocumentErrors,
    }),
  )
}

export async function getCommitChanges(
  { workspace, commit }: { workspace: Workspace; commit: Commit },
  db = database,
): PromisedResult<ChangedDocument[]> {
  if (!commit.mergedAt) {
    return getDraftChanges({ workspace, draft: commit }, db)
  }

  const commitsRepository = new CommitsRepository(workspace.id, db)
  const previousCommit = await commitsRepository.getPreviousCommit(commit)

  const documentsRepository = new DocumentVersionsRepository(workspace.id, db)

  const currentCommitChanges =
    await documentsRepository.listCommitChanges(commit)
  if (currentCommitChanges.error) {
    return Result.error(currentCommitChanges.error)
  }

  const previousCommitDocuments = previousCommit
    ? await documentsRepository.getDocumentsAtCommit(previousCommit)
    : Result.ok([])

  if (previousCommitDocuments.error) {
    return Result.error(previousCommitDocuments.error)
  }

  return Result.ok(
    changesPresenter({
      currentCommitChanges: currentCommitChanges.value,
      previousCommitDocuments: previousCommitDocuments.value,
      errors: {},
    }),
  )
}
