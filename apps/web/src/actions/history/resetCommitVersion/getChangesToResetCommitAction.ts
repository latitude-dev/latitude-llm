'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { computeChangesToRevertCommit } from '@latitude-data/core/services/commits/computeRevertChanges'

export const getChangesToResetCommitAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftUuid: z.string().optional(),
      commitUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = input

    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope
      .getHeadCommit(ctx.project.id)
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
      workspace: ctx.workspace,
      targetDraft: targetCommit,
      changedCommit: targetCommit,
      originalCommit,
    }).then((r) => r.unwrap())

    const docsScope = new DocumentVersionsRepository(workspace.id)

    const newDocuments = await docsScope
      .getDocumentsAtCommit(targetCommit)
      .then((r) => r.unwrap())
    const oldDocuments = await docsScope
      .getDocumentsAtCommit(originalCommit)
      .then((r) => r.unwrap())

    return changes.map((change) => {
      const isCreated = change.deletedAt === null
      const isDeleted = !isCreated && change.deletedAt !== undefined

      const newDocument = newDocuments.find(
        (d) => d.documentUuid === change.documentUuid,
      )
      const oldDocument = oldDocuments.find(
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
      }
    })
  })
