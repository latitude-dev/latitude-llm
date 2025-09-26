'use server'

import { createCommit } from '@latitude-data/core/services/commits/create'
import { z } from 'zod'

import { withProject } from '../procedures'

export const createDraftCommitAction = withProject
  .inputSchema(
    z.object({
      title: z.string().min(1, { error: 'Title is required' }),
      description: z.string().optional().default(''),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await createCommit({
      project: ctx.project,
      user: ctx.user,
      data: {
        title: parsedInput.title,
        description: parsedInput.description,
      },
    })

    return result.unwrap()
  })
