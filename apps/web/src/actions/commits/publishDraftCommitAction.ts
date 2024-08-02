'use server'

import { CommitsRepository, mergeCommit } from '@latitude-data/core'
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
