'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { computeDocumentRevertChanges } from '@latitude-data/core/services/documents/computeRevertChanges'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'

export const resetDocumentVersionAction = withProject
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

    const documentVersionChanges = await computeDocumentRevertChanges({
      workspace: ctx.workspace,
      draft: targetCommit,
      changedDocument: targetDocument,
      originalDocument,
    }).then((r) => r.unwrap())

    const oldDocumentPath =
      targetDocument?.path ??
      originalDocument?.path ??
      documentVersionChanges.path

    const targetDraft = targetDraftUuid
      ? targetCommit
      : await createCommit({
          project: ctx.project,
          user: ctx.user,
          data: {
            title: `Reset "${oldDocumentPath}"`,
            description: `Reset document "${oldDocumentPath}" to version "${targetCommit.title}"`,
          },
        }).then((r) => r.unwrap())

    await updateDocument({
      commit: targetDraft,
      document: targetDocument ?? originalDocument!,
      path: documentVersionChanges.path,
      content: documentVersionChanges.content,
      deletedAt: documentVersionChanges.deletedAt,
    }).then((r) => r.unwrap())

    return {
      commitUuid: targetDraft.uuid,
      documentUuid:
        documentVersionChanges.deletedAt != null ? undefined : documentUuid,
    }
  })
