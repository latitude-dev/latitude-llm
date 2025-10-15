import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { DraftChange } from '../../constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { createCommit } from '../commits'
import { computeDocumentRevertChanges, updateDocument } from '../documents'

async function fetchDocumentVersionDetails({
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
    const docsScope = new DocumentVersionsRepository(workspace.id)

    const originalDocument = await docsScope
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: documentCommitUuid,
        documentUuid,
      })
      .then((r) => r.value)

    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope.getHeadCommit(project.id)
    if (!headCommit)
      return Result.error(new NotFoundError('Head commit not found'))

    const targetCommit = targetDraftUuid
      ? await commitScope
        .getCommitByUuid({ uuid: targetDraftUuid, projectId: project.id })
        .then((r) => r.unwrap())
      : headCommit

    const targetDocument = await docsScope
      .getDocumentAtCommit({
        commitUuid: targetCommit.uuid,
        documentUuid: documentUuid,
      })
      .then((r) => r.value)

    return Result.ok({ originalDocument, targetCommit, targetDocument })
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function getChangesToResetDocumentToVersion({
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
  const documentVersionDetails = await fetchDocumentVersionDetails({
    workspace,
    project,
    targetDraftUuid,
    documentCommitUuid,
    documentUuid,
  })
  if (documentVersionDetails.error) {
    return Result.error(documentVersionDetails.error)
  }
  const { originalDocument, targetCommit, targetDocument } =
    documentVersionDetails.unwrap()

  const changeResult = await computeDocumentRevertChanges({
    workspace: workspace,
    draft: targetCommit,
    changedDocument: targetDocument,
    originalDocument,
  })
  if (changeResult.error) return Result.error(changeResult.error)
  const change = changeResult.unwrap()

  const isCreated = change.deletedAt === null
  const isDeleted = !isCreated && change.deletedAt !== undefined

  const newDocumentPath =
    change.path ?? targetDocument?.path ?? originalDocument!.path

  const oldDocumentPath =
    targetDocument?.path ?? originalDocument?.path ?? newDocumentPath

  const previousContent = targetDocument?.content ?? originalDocument?.content

  const newContent = isDeleted ? undefined : (change.content ?? previousContent)

  const oldCOntent = isCreated ? undefined : previousContent

  const draftChange: DraftChange = {
    newDocumentPath,
    oldDocumentPath,
    content: {
      oldValue: oldCOntent,
      newValue: newContent,
    },
  }

  return Result.ok(draftChange)
}

export async function resetDocumentToVersion({
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
  const documentVersionDetails = await fetchDocumentVersionDetails({
    workspace,
    project,
    targetDraftUuid,
    documentCommitUuid,
    documentUuid,
  })
  if (documentVersionDetails.error) {
    return Result.error(documentVersionDetails.error)
  }
  const { originalDocument, targetCommit, targetDocument } =
    documentVersionDetails.unwrap()

  const documentVersionChangesResult = await computeDocumentRevertChanges({
    workspace: workspace,
    draft: targetCommit,
    changedDocument: targetDocument,
    originalDocument,
  })

  if (documentVersionChangesResult.error) {
    return Result.error(documentVersionChangesResult.error)
  }
  const documentVersionChanges = documentVersionChangesResult.unwrap()

  const oldDocumentPath =
    targetDocument?.path ??
    originalDocument?.path ??
    documentVersionChanges.path

  const targetDraftResult = targetDraftUuid
    ? Result.ok(targetCommit)
    : await createCommit({
      project: project,
      user: user,
      data: {
        title: `Reset "${oldDocumentPath}"`,
        description: `Reset document "${oldDocumentPath}" to version "${targetCommit.title}"`,
      },
    })

  const targetDraft = targetDraftResult.unwrap()

  const updateResult = await updateDocument({
    commit: targetDraft,
    document: targetDocument ?? originalDocument!,
    path: documentVersionChanges.path,
    content: documentVersionChanges.content,
    deletedAt: documentVersionChanges.deletedAt,
  })

  if (updateResult.error) {
    return Result.error(updateResult.error)
  }

  return Result.ok({
    commit: targetDraft,
    documentUuid:
      documentVersionChanges.deletedAt != null ? undefined : documentUuid,
  })
}
