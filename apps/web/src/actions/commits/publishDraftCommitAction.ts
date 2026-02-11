'use server'

import { CommitsRepository } from '@latitude-data/core/repositories'
import { updateAndMergeCommit } from '@latitude-data/core/services/commits/updateAndMerge'
import { z } from 'zod'

import { withProject, withProjectSchema } from '../procedures'

export const publishDraftCommitAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { workspace } = ctx
    const { id: commitId, title, description } = parsedInput

    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    return updateAndMergeCommit({
      commit,
      workspace,
      data: {
        title,
        description,
      },
    }).then((r) => r.unwrap())
  })
