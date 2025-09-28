import { Commit, Project, User, Workspace } from '../../schema/types'
import { DraftChange } from '../../constants'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { createCommit } from '../commits'
import { computeChangesToRevertCommit } from '../commits/computeRevertChanges'
import { updateDocument } from '../documents'

async function fetchCommitDetails({
  workspace,
  project,
  targetDraftUuid,
  commitUuid,
}: {
  workspace: Workspace
  project: Project
  targetDraftUuid?: string
  commitUuid: string
}) {
  try {
    const commitScope = new CommitsRepository(workspace.id)

    const headCommit = await commitScope
      .getHeadCommit(project.id)
      .then((r) => r.unwrap()!)

    const targetCommit = targetDraftUuid
      ? await commitScope
          .getCommitByUuid({ uuid: targetDraftUuid, projectId: project.id })
          .then((r) => r.unwrap())
      : headCommit

    const originalCommit = await commitScope
      .getCommitByUuid({ projectId: project.id, uuid: commitUuid })
      .then((r) => r.unwrap())

    const changes = await computeChangesToRevertCommit({
      workspace,
      targetDraft: targetCommit,
      changedCommit: targetCommit,
      originalCommit,
    }).then((r) => r.unwrap())

    return Result.ok({ headCommit, targetCommit, originalCommit, changes })
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function getChangesToResetProjectToCommit({
  workspace,
  project,
  targetDraftUuid,
  commitUuid,
}: {
  workspace: Workspace
  project: Project
  targetDraftUuid?: string
  commitUuid: string
}): PromisedResult<DraftChange[]> {
  const commitDetailsResult = await fetchCommitDetails({
    workspace,
    project,
    targetDraftUuid,
    commitUuid,
  })
  if (commitDetailsResult.error) {
    return Result.error(commitDetailsResult.error)
  }

  const { targetCommit, originalCommit, changes } = commitDetailsResult.unwrap()

  const docsScope = new DocumentVersionsRepository(workspace.id)

  const newDocuments = await docsScope.getDocumentsAtCommit(targetCommit)
  const oldDocuments = await docsScope.getDocumentsAtCommit(originalCommit)

  if (newDocuments.error) return Result.error(newDocuments.error)
  if (oldDocuments.error) return Result.error(oldDocuments.error)

  return Result.ok(
    changes.map((change) => {
      const isCreated = change.deletedAt === null
      const isDeleted = !isCreated && change.deletedAt !== undefined

      const newDocument = newDocuments.value.find(
        (d) => d.documentUuid === change.documentUuid,
      )
      const oldDocument = oldDocuments.value.find(
        (d) => d.documentUuid === change.documentUuid,
      )

      const newDocumentPath =
        change.path ?? newDocument?.path ?? oldDocument!.path

      const oldDocumentPath =
        newDocument?.path ?? oldDocument?.path ?? newDocumentPath

      const previousContent = newDocument?.content ?? oldDocument?.content

      const newContent = isDeleted
        ? undefined
        : (change.content ?? previousContent)

      const oldCOntent = isCreated ? undefined : previousContent

      return {
        newDocumentPath,
        oldDocumentPath,
        content: {
          oldValue: oldCOntent,
          newValue: newContent,
        },
      } as DraftChange
    }),
  )
}

export async function resetProjectToCommit(
  {
    user,
    workspace,
    project,
    targetDraftUuid,
    commitUuid,
  }: {
    user: User
    workspace: Workspace
    project: Project
    targetDraftUuid?: string
    commitUuid: string
  },
  db = database,
): PromisedResult<Commit> {
  const commitDetaulsResult = await fetchCommitDetails({
    workspace,
    project,
    targetDraftUuid,
    commitUuid,
  })
  if (commitDetaulsResult.error) {
    return Result.error(commitDetaulsResult.error)
  }
  const { targetCommit, originalCommit, changes } = commitDetaulsResult.unwrap()

  const targetDraft = targetDraftUuid
    ? Result.ok(targetCommit)
    : await createCommit({
        project: project,
        user: user,
        data: {
          title: `Reset project to v${originalCommit.version} "${originalCommit.title}"`,
          description: `Resetted the project to the state of commit v${originalCommit.version} "${originalCommit.title}"`,
        },
      })

  if (targetDraft.error) {
    return Result.error(targetDraft.error)
  }

  const docsScope = new DocumentVersionsRepository(workspace.id, db, {
    includeDeleted: true,
  })
  const targetDocumentsResult = await docsScope.getDocumentsAtCommit(
    targetDraft.value,
  )

  if (targetDocumentsResult.error) {
    return Result.error(targetDocumentsResult.error)
  }
  const targetDocuments = targetDocumentsResult.unwrap()

  const results = await Promise.all(
    changes.map((change) => {
      const document = targetDocuments.find(
        (d) => d.documentUuid === change.documentUuid,
      )

      return updateDocument({
        commit: targetDraft.value,
        document: document!,
        path: change.path,
        content: change.content,
        deletedAt: change.deletedAt,
      })
    }),
  )

  for (const result of results) {
    if (result.error) return result
  }

  return Result.ok(targetDraft.value)
}
