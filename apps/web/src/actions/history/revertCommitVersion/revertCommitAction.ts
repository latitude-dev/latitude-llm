'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { getDocumentsAtCommitCached } from '$/app/(private)/_data-access'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { computeChangesToRevertCommit } from '@latitude-data/core/services/commits/computeRevertChanges'

export const revertCommitChangesAction = withProject
  .createServerAction()
  .input(
    z.object({
      targetDraftUuid: z.string().optional(),
      commitUuid: z.string(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { user, workspace, project } = ctx
    const { targetDraftUuid, commitUuid } = input

    const commitScope = new CommitsRepository(workspace.id)
    const headCommit = await commitScope
      .getHeadCommit(project.id)
      .then((r) => r.unwrap()!)

    const currentCommit = targetDraftUuid
      ? await commitScope
          .getCommitByUuid({ uuid: targetDraftUuid, projectId: project.id })
          .then((r) => r.unwrap())
      : headCommit

    const changedCommit = await commitScope
      .getCommitByUuid({ projectId: project.id, uuid: commitUuid })
      .then((r) => r.unwrap())

    const originalCommit = await commitScope.getPreviousCommit(changedCommit)
    const changedDocuments = await getDocumentsAtCommitCached({
      commit: changedCommit,
    })
    const originalDocuments = originalCommit
      ? await getDocumentsAtCommitCached({
          commit: originalCommit,
        })
      : []

    const changes = await computeChangesToRevertCommit({
      workspace,
      targetDraft: currentCommit,
      changedCommit,
      originalCommit,
    }).then((r) => r.unwrap())

    const targetDraft = targetDraftUuid
      ? currentCommit
      : await createCommit({
          project: project,
          user: user,
          data: {
            title: `Revert changes for v${changedCommit.version} "${changedCommit.title}"`,
            description: `Reverted changes of version v${changedCommit.version} "${changedCommit.title}"`,
          },
        }).then((r) => r.unwrap())

    await Promise.all(
      changes.map(async (documentVersionChanges) => {
        const changedDocument = changedDocuments.find(
          (d) => d.documentUuid == documentVersionChanges.documentUuid!,
        )
        const originalDocument = originalDocuments.find(
          (d) => d.documentUuid == documentVersionChanges.documentUuid!,
        )

        await updateDocument({
          commit: targetDraft,
          document: changedDocument ?? originalDocument!,
          path: documentVersionChanges.path,
          content: documentVersionChanges.content,
          deletedAt: documentVersionChanges.deletedAt,
        }).then((r) => r.unwrap())
      }),
    )

    return {
      commitUuid: targetDraft.uuid,
    }
  })
