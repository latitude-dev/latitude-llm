'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { computeChangesToRevertCommit } from '@latitude-data/core/services/commits/computeRevertChanges'

export const getChangesToRevertCommitAction = withProject
  .createServerAction()
  .input(
    z.object({
      commitUuid: z.string(),
      targetDraftUuid: z.string().optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = input

    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope
      .getHeadCommit(project.id)
      .then((r) => r.unwrap()!)

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
    const originalDocuments = await docsScope
      .getDocumentsAtCommit(originalCommit)
      .then((r) => r.unwrap())

    const changes = await computeChangesToRevertCommit({
      workspace,
      targetDraft,
      changedCommit,
      originalCommit,
    }).then((r) =>
      r.unwrap().map((change) => {
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
      }),
    )

    return changes
  })
