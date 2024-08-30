'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { destroyFolder } from '@latitude-data/core/services/documents/destroyFolder'
import { z } from 'zod'

import { withProject } from '../procedures'

export const destroyFolderAction = withProject
  .createServerAction()
  .input(z.object({ path: z.string(), commitId: z.number() }), {
    type: 'json',
  })
  .handler(async ({ input, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitById(input.commitId)
      .then((r) => r.unwrap())
    const result = await destroyFolder({
      path: input.path,
      commit,
      workspaceId: ctx.project.workspaceId,
    })
    return result.unwrap()
  })
