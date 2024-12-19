'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { computeDocumentRevertChanges } from '@latitude-data/core/services/documents/computeRevertChanges'
import { DraftChange } from '../types'

export const getChangesToResetDocumentAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftUuid: z.string().optional(),
      documentCommitUuid: z.string(),
      documentUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { workspace, project } = ctx
    const { targetDraftUuid, documentCommitUuid, documentUuid } = input

    const docsScope = new DocumentVersionsRepository(workspace.id)

    const originalDocument = await docsScope
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: documentCommitUuid,
        documentUuid,
      })
      .then((r) => r.value)

    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope
      .getHeadCommit(ctx.project.id)
      .then((r) => r.unwrap()!)

    const targetCommit = targetDraftUuid
      ? await commitScope
          .getCommitByUuid({ uuid: targetDraftUuid, projectId: project.id })
          .then((r) => r.unwrap())
      : headCommit

    const targetDocument = await docsScope
      .getDocumentAtCommit({
        commitUuid: targetCommit.uuid,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.value)

    const change = await computeDocumentRevertChanges({
      workspace: ctx.workspace,
      draft: targetCommit,
      changedDocument: targetDocument,
      originalDocument,
    }).then((r) => r.unwrap())

    const isCreated = change.deletedAt === null
    const isDeleted = !isCreated && change.deletedAt !== undefined

    const newDocumentPath =
      change.path ?? targetDocument?.path ?? originalDocument!.path

    const oldDocumentPath =
      targetDocument?.path ?? originalDocument?.path ?? newDocumentPath

    const previousContent = targetDocument?.content ?? originalDocument?.content

    const newContent = isDeleted
      ? undefined
      : (change.content ?? previousContent)

    const oldCOntent = isCreated ? undefined : previousContent

    const draftChange: DraftChange = {
      newDocumentPath,
      oldDocumentPath,
      content: {
        oldValue: oldCOntent,
        newValue: newContent,
      },
    }

    return [draftChange]
  })
