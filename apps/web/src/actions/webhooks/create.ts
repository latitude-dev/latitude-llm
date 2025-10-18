'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { createWebhook } from '@latitude-data/core/services/webhooks/createWebhook'
import { BadRequestError } from '@latitude-data/constants/errors'

export const createWebhookAction = authProcedure
  .inputSchema(
    z.object({
      name: z.string().min(1, { error: 'Name is required' }),
      url: z.string().pipe(z.url({ error: 'Invalid URL format' })),
      projectIds: z.string().optional(),
      isActive: z.string().optional().default('true'),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    let projectIds: number[] | undefined
    try {
      projectIds = parsedInput.projectIds
        ? JSON.parse(parsedInput.projectIds)
        : undefined
    } catch (_error) {
      throw new BadRequestError('Invalid project IDs')
    }

    const result = await createWebhook({
      workspaceId: ctx.workspace.id,
      name: parsedInput.name,
      url: parsedInput.url,
      projectIds: projectIds || [],
      isActive: parsedInput.isActive === 'true',
    })

    return result.unwrap()
  })
