'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { createWebhook } from '@latitude-data/core/services/webhooks/createWebhook'
import { BadRequestError } from '@latitude-data/core/lib/errors'

export const createWebhookAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      name: z.string().min(1, { message: 'Name is required' }),
      url: z.string().url({ message: 'Invalid URL format' }),
      projectIds: z.string().optional(),
      isActive: z.string().optional().default('true'),
    }),
  )
  .handler(async ({ input, ctx }) => {
    let projectIds: number[] | undefined
    try {
      projectIds = input.projectIds ? JSON.parse(input.projectIds) : undefined
    } catch (error) {
      throw new BadRequestError('Invalid project IDs')
    }

    const result = await createWebhook({
      workspaceId: ctx.workspace.id,
      name: input.name,
      url: input.url,
      projectIds: projectIds || [],
      isActive: input.isActive === 'true',
    })

    return result.unwrap()
  })
