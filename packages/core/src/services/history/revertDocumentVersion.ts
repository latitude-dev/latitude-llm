import type { Commit, DraftChange, Project, User, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import type { PromisedResult } from '../../lib/Transaction'
import { CommitsRepository, DocumentVersionsRepository } from '../../repositories'
import { createCommit } from '../commits'
import { computeDocumentRevertChanges, updateDocument } from '../documents'

async function fetchDocumentReversionDetails({
  workspace,
  project,
  targetDraftUuid,
  documentCommitUuid,
  documentUuid,
}: {
  workspace: Workspace
  project: Project
  targetDraftUuid?: string
  documentCommitUuid: string
  documentUuid: string
}) {
  try {
    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope.getHeadCommit(project.id).then((r) => r.unwrap()!)

    const targetDraft = targetDraftUuid
      ? await commitScope
          .getCommitByUuid({ uuid: targetDraftUuid, projectId: project.id })
          .then((r) => r.unwrap())
      : headCommit

    const changedCommit = await commitScope
      .getCommitByUuid({ projectId: project.id, uuid: documentCommitUuid })
      .then((r) => r.unwrap())

    const originalCommit = await commitScope.getPreviousCommit(changedCommit)

    const docsScope = new DocumentVersionsRepository(workspace.id)

    const draftDocument = await docsScope
      .getDocumentAtCommit({
        commitUuid: targetDraft.uuid,
        documentUuid: documentUuid,
      })
      .then((r) => r.value)

    const changedDocument = await docsScope
      .getDocumentAtCommit({
        commitUuid: changedCommit.uuid,
        documentUuid: documentUuid,
      })
      .then((r) => r.value)

    const originalDocument = originalCommit
      ? await docsScope
          .getDocumentAtCommit({
            commitUuid: originalCommit.uuid,
            documentUuid: documentUuid,
          })
          .then((r) => r.value)
      : undefined

    return Result.ok({
      headCommit,
      targetDraft,
      changedCommit,
      originalCommit,
      draftDocument,
      changedDocument,
      originalDocument,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function getChangesToRevertDocumentChanges({
  workspace,
  project,
  targetDraftUuid,
  documentCommitUuid,
  documentUuid,
}: {
  workspace: Workspace
  project: Project
  targetDraftUuid?: string
  documentCommitUuid: string
  documentUuid: string
}): PromisedResult<DraftChange> {
  const documentReversionDetails = await fetchDocumentReversionDetails({
    workspace,
    project,
    targetDraftUuid,
    documentCommitUuid,
    documentUuid,
  })
  if (documentReversionDetails.error) {
    return Result.error(documentReversionDetails.error)
  }
  const { targetDraft, changedDocument, originalDocument, draftDocument } =
    documentReversionDetails.unwrap()

  const changeResult = await computeDocumentRevertChanges({
    workspace,
    draft: targetDraft,
    changedDocument,
    originalDocument,
  })

  if (changeResult.error) return Result.error(changeResult.error)
  const change = changeResult.unwrap()

  const isCreated = change.deletedAt === null
  const isDeleted = !isCreated && change.deletedAt !== undefined

  const newDocumentPath =
    change.path ?? draftDocument?.path ?? changedDocument?.path ?? originalDocument!.path

  const oldDocumentPath =
    draftDocument?.path ?? originalDocument?.path ?? changedDocument?.path ?? newDocumentPath!

  const previousContent =
    draftDocument?.content ?? changedDocument?.content ?? originalDocument?.content

  const newContent = isDeleted ? undefined : (change.content ?? previousContent)

  const oldContent = isCreated ? undefined : previousContent

  const draftChange: DraftChange = {
    newDocumentPath,
    oldDocumentPath,
    content: {
      oldValue: oldContent,
      newValue: newContent,
    },
  }

  return Result.ok(draftChange)
}

export async function revertChangesToDocument({
  workspace,
  project,
  user,
  targetDraftUuid,
  documentCommitUuid,
  documentUuid,
}: {
  workspace: Workspace
  project: Project
  user: User
  targetDraftUuid?: string
  documentCommitUuid: string
  documentUuid: string
}): PromisedResult<{ commit: Commit; documentUuid?: string }> {
  const documentReversionDetails = await fetchDocumentReversionDetails({
    workspace,
    project,
    targetDraftUuid,
    documentCommitUuid,
    documentUuid,
  })
  if (documentReversionDetails.error) {
    return Result.error(documentReversionDetails.error)
  }
  const { targetDraft, changedDocument, originalDocument, changedCommit } =
    documentReversionDetails.unwrap()

  const documentVersionChangesResult = await computeDocumentRevertChanges({
    workspace,
    draft: targetDraft,
    changedDocument,
    originalDocument,
  })

  if (documentVersionChangesResult.error) {
    return Result.error(documentVersionChangesResult.error)
  }

  const documentVersionChanges = documentVersionChangesResult.unwrap()

  const oldDocumentPath =
    changedDocument?.path ?? originalDocument?.path ?? documentVersionChanges.path

  const finalDraft = targetDraftUuid
    ? Result.ok(targetDraft)
    : await createCommit({
        project: project,
        user: user,
        data: {
          title: `Revert changes for "${oldDocumentPath}"`,
          description: `Reverted changes of "${oldDocumentPath}" made in version ${changedCommit.title}`,
        },
      })

  if (finalDraft.error) return Result.error(finalDraft.error)

  await updateDocument({
    commit: finalDraft.value,
    document: changedDocument ?? originalDocument!,
    path: documentVersionChanges.path,
    content: documentVersionChanges.content,
    deletedAt: documentVersionChanges.deletedAt,
  }).then((r) => r.unwrap())

  return Result.ok({
    commit: finalDraft.value,
    documentUuid: documentVersionChanges.deletedAt != null ? undefined : documentUuid,
  })
}
