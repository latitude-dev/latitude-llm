'use server'

import { publisher } from '@latitude-data/core/events/publisher'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { updateAndMergeCommit } from '@latitude-data/core/services/commits/updateAndMerge'
import { z } from 'zod'

import { withProject } from '../procedures'

export const publishDraftCommitAction = withProject
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const commitScope = new CommitsRepository(ctx.workspace.id)
    const commit = await commitScope
      .getCommitById(input.id)
      .then((r) => r.unwrap())

    const merged = await updateAndMergeCommit(commit, {
      title: input.title,
      description: input.description,
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
