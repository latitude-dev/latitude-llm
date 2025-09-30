'use server'

import { createCommit } from '@latitude-data/core/services/commits/create'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDraftCommitAction = withProject
  .createServerAction()
  .input(
    z.object({
      title: z.string().min(1, { message: 'Title is required' }),
      description: z.string().optional().default(''),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const result = await createCommit({
      project: ctx.project,
      user: ctx.user,
      data: {
        title: input.title,
        description: input.description,
      },
    })

    return result.unwrap()
  })
