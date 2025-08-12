'use server'

import { publisher } from '@latitude-data/core/events/publisher'
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
    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope
      .getCommitById(parsedInput.id)
      .then((r) => r.unwrap())

    const merged = await updateAndMergeCommit(commit, {
      title: parsedInput.title,
      description: parsedInput.description,
    }).then((r) => r.unwrap())

    publisher.publishLater({
      type: 'commitPublished',
      data: {
        commit: merged,
        userEmail: ctx.user.email,
        workspaceId: ctx.workspace.id,
      },
    })

    return merged
  })
