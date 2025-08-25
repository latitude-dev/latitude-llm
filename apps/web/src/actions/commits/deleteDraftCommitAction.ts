'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { deleteCommitDraft } from '@latitude-data/core/services/commits/delete'
import { z } from 'zod'

import { withProject } from '../procedures'

export const deleteDraftCommitAction = withProject
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope.getCommitById(input.id).then((r) => r.unwrap())

    return deleteCommitDraft(commit).then((r) => r.unwrap())
  })
