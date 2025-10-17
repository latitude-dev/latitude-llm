import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { DraftChange } from '../../constants'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { createCommit } from '../commits'
import { computeChangesToRevertCommit } from '../commits/computeRevertChanges'
import { updateDocument } from '../documents'

async function fetchCommitReversionDetails({
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
    const headCommit = await commitScope.getHeadCommit(project.id)
    if (!headCommit)
      return Result.error(new NotFoundError('Head commit not found'))

    const targetDraft = targetDraftUuid
      ? await commitScope
        .getCommitByUuid({ uuid: targetDraftUuid, projectId: project.id })
        .then((r) => r.unwrap())
      : headCommit

    const changedCommit = await commitScope
      .getCommitByUuid({ projectId: project.id, uuid: commitUuid })
      .then((r) => r.unwrap())

    const originalCommit = await commitScope.getPreviousCommit(changedCommit)

    const docsScope = new DocumentVersionsRepository(workspace.id)

    const draftDocuments = await docsScope
      .getDocumentsAtCommit(targetDraft)
      .then((r) => r.unwrap())
    const changedDocuments = await docsScope
      .getDocumentsAtCommit(changedCommit)
      .then((r) => r.unwrap())
    const originalDocuments = originalCommit
      ? await docsScope
        .getDocumentsAtCommit(originalCommit)
        .then((r) => r.unwrap())
      : []

    return Result.ok({
      headCommit,
      targetDraft,
      changedCommit,
      originalCommit,
      draftDocuments,
      changedDocuments,
      originalDocuments,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function getChangesToRevertCommit({
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
  const commitRevisionDetauls = await fetchCommitReversionDetails({
    workspace,
    project,
    targetDraftUuid,
    commitUuid,
  })
  if (commitRevisionDetauls.error) {
    return Result.error(commitRevisionDetauls.error)
  }
  const {
    targetDraft,
    changedCommit,
    originalCommit,
    draftDocuments,
    changedDocuments,
    originalDocuments,
  } = commitRevisionDetauls.unwrap()

  const computedChanges = await computeChangesToRevertCommit({
    workspace,
    targetDraft,
    changedCommit,
    originalCommit,
  })

  if (computedChanges.error) return Result.error(computedChanges.error)

  const changes = computedChanges.value.map((change) => {
    const isCreated = change.deletedAt === null
    const isDeleted = !isCreated && change.deletedAt !== undefined

    const draftDocument = draftDocuments.find(
      (d) => d.documentUuid === change.documentUuid!,
    )
    const changedDocument = changedDocuments.find(
      (d) => d.documentUuid === change.documentUuid!,
    )
    const originalDocument = originalDocuments.find(
      (d) => d.documentUuid === change.documentUuid!,
    )

    const newDocumentPath =
      change.path ??
      draftDocument?.path ??
      changedDocument?.path ??
      originalDocument!.path

    const oldDocumentPath =
      draftDocument?.path ??
      originalDocument?.path ??
      changedDocument?.path ??
      newDocumentPath

    const previousContent =
      draftDocument?.content ??
      changedDocument?.content ??
      originalDocument?.content

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
    }
  })

  return Result.ok(changes)
}

export async function revertCommit(
  {
    workspace,
    project,
    user,
    targetDraftUuid,
    commitUuid,
  }: {
    workspace: Workspace
    project: Project
    user: User
    targetDraftUuid?: string
    commitUuid: string
  },
  transaction = new Transaction(),
): PromisedResult<Commit> {
  const commitRevisionDetauls = await fetchCommitReversionDetails({
    workspace,
    project,
    targetDraftUuid,
    commitUuid,
  })
  if (commitRevisionDetauls.error) {
    return Result.error(commitRevisionDetauls.error)
  }

  const {
    targetDraft,
    changedCommit,
    originalCommit,
    changedDocuments,
    originalDocuments,
  } = commitRevisionDetauls.unwrap()

  return transaction.call(async (trx) => {
    const changes = await computeChangesToRevertCommit(
      {
        workspace,
        targetDraft,
        changedCommit,
        originalCommit,
      },
      trx,
    )

    if (changes.error) return Result.error(changes.error)

    const finalDraft = targetDraftUuid
      ? Result.ok(targetDraft)
      : await createCommit(
        {
          project: project,
          user: user,
          data: {
            title: `Revert changes for v${changedCommit.version} "${changedCommit.title}"`,
            description: `Reverted changes of version v${changedCommit.version} "${changedCommit.title}"`,
          },
        },
        transaction,
      )

    if (finalDraft.error) return Result.error(finalDraft.error)

    const computedChanges = await Promise.all(
      changes.value.map((documentVersionChanges) => {
        const changedDocument = changedDocuments.find(
          (d) => d.documentUuid == documentVersionChanges.documentUuid!,
        )
        const originalDocument = originalDocuments.find(
          (d) => d.documentUuid == documentVersionChanges.documentUuid!,
        )

        return updateDocument(
          {
            commit: finalDraft.value,
            document: changedDocument ?? originalDocument!,
            path: documentVersionChanges.path,
            content: documentVersionChanges.content,
            deletedAt: documentVersionChanges.deletedAt,
          },
          transaction,
        )
      }),
    )

    for (const result of computedChanges) {
      if (result.error) return Result.error(result.error)
    }

    return Result.ok(finalDraft.value)
  })
}
