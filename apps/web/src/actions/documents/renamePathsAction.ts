'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { renameDocumentPaths } from '@latitude-data/core/services/documents/renameDocumentPaths'
import { z } from 'zod'

import { withProject } from '../procedures'

export const renameDocumentPathsAction = withProject
  .createServerAction()
  .input(
    z.object({
      commitUuid: z.string(),
      oldPath: z.string(),
      newPath: z.string(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitByUuid({ uuid: input.commitUuid, projectId: ctx.project.id })
      .then((r) => r.unwrap())

    const result = await renameDocumentPaths({
      commit,
      oldPath: input.oldPath,
      newPath: input.newPath,
    })

    return result.unwrap()
  })
