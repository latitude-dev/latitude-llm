'use server'

import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../../procedures'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { computeChangesToRevertCommit } from '@latitude-data/core/services/commits/computeRevertChanges'
import { database } from '@latitude-data/core/client'

export const resetCommitVersionAction = withProject
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
      .getCommitByUuid({
        projectId: project.id,
        uuid: commitUuid,
      })
      .then((r) => r.unwrap())

    const changes = await computeChangesToRevertCommit({
      workspace: ctx.workspace,
      targetDraft: targetCommit,
      changedCommit: targetCommit,
      originalCommit,
    }).then((r) => r.unwrap())

    const targetDraft = targetDraftUuid
      ? targetCommit
      : await createCommit({
          project: ctx.project,
          user: ctx.user,
          data: {
            title: `Reset project to v${originalCommit.version} "${originalCommit.title}"`,
            description: `Resetted the project to the state of commit v${originalCommit.version} "${originalCommit.title}"`,
          },
        }).then((r) => r.unwrap())

    const docsScope = new DocumentVersionsRepository(workspace.id, database, {
      includeDeleted: true,
    })
    const targetDocuments = await docsScope
      .getDocumentsAtCommit(targetDraft)
      .then((r) => r.unwrap())

    await Promise.all(
      changes.map(async (change) => {
        const document = targetDocuments.find(
          (d) => d.documentUuid === change.documentUuid,
        )

        await updateDocument({
          commit: targetDraft,
          document: document!,
          path: change.path,
          content: change.content,
          deletedAt: change.deletedAt,
        }).then((r) => r.unwrap())
      }),
    )

    return {
      commitUuid: targetDraft.uuid,
    }
  })
