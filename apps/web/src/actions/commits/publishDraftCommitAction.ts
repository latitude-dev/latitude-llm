'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { z } from 'zod'

import { withProject } from '../procedures'

export const publishDraftCommitAction = withProject
  .createServerAction()
  .input(z.object({ id: z.number() }))
  .handler(async ({ input, ctx }) => {
    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope
      .getCommitById(input.id)
      .then((r) => r.unwrap())
    const merged = await mergeCommit(commit).then((r) => r.unwrap())
    return merged
  })
