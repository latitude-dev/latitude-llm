import {
  ChangedDocument,
  CommitChanges,
  DocumentTriggerStatus,
} from '@latitude-data/constants'
import type { CompileError } from 'promptl-ai'
import {
  Commit,
  DocumentVersion,
  ModifiedDocumentType,
  Workspace,
} from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { recomputeChanges } from '../documents'
import { getCommitTriggerChanges } from '../documentTriggers/changes/getTriggerChanges'

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
  transaction = new Transaction(),
): PromisedResult<ChangedDocument[]> {
  const result = await recomputeChanges({ draft, workspace }, transaction)
  if (result.error) return result
  const changes = result.value

  // Include documents with errors on `changes.changedDocuments`
  for (const documentUuid of Object.keys(changes.errors)) {
    if (
      changes.changedDocuments.some((doc) => doc.documentUuid === documentUuid)
    )
      continue

    const document = changes.headDocuments.find(
      (doc) => doc.documentUuid === documentUuid,
    )
    if (!document) continue

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
  transaction = new Transaction(),
): PromisedResult<CommitChanges> {
  return transaction.call(async (tx) => {
    // Get document changes
    let documentChanges: ChangedDocument[]
    if (!commit.mergedAt) {
      const draftResult = await getDraftChanges(
        { workspace, draft: commit },
        transaction,
      )
      if (draftResult.error) return Result.error(draftResult.error)
      documentChanges = draftResult.value
    } else {
      const commitsRepository = new CommitsRepository(workspace.id, tx)
      const previousCommit = await commitsRepository.getPreviousCommit(commit)
      const documentsRepository = new DocumentVersionsRepository(
        workspace.id,
        tx,
      )

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

      documentChanges = changesPresenter({
        currentCommitChanges: currentCommitChanges.value,
        previousCommitDocuments: previousCommitDocuments.value,
        errors: {},
      })
    }

    // Get trigger changes
    const triggerChangesResult = await getCommitTriggerChanges(
      { workspace, commit },
      transaction,
    )
    if (triggerChangesResult.error)
      return Result.error(triggerChangesResult.error)

    // Separate documents by error status
    const documentsWithErrors = documentChanges.filter((doc) => doc.errors > 0)
    const documentsWithoutErrors = documentChanges.filter(
      (doc) => doc.errors === 0,
    )

    const allTriggers = triggerChangesResult.value
    const cleanTriggers = allTriggers.filter(
      (trigger) => trigger.status !== DocumentTriggerStatus.Pending,
    )
    const pendingTriggers = allTriggers.filter(
      (trigger) => trigger.status === DocumentTriggerStatus.Pending,
    )

    const hasErrors = documentsWithErrors.length > 0
    const hasPending = pendingTriggers.length > 0
    return Result.ok({
      anyChanges: allTriggers.length > 0 || documentChanges.length > 0,
      hasIssues: hasErrors || hasPending,
      documents: {
        hasErrors,
        all: documentChanges,
        clean: documentsWithoutErrors,
        errors: documentsWithErrors,
      },
      triggers: {
        hasPending,
        all: allTriggers,
        clean: cleanTriggers,
        pending: pendingTriggers,
      },
    })
  })
}
