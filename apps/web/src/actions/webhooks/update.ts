'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { getWebhook } from '@latitude-data/core/services/webhooks/getWebhook'
import { updateWebhook } from '@latitude-data/core/services/webhooks/updateWebhook'
import { z } from 'zod'
import { authProcedure } from '../procedures'

export const updateWebhookAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.coerce.number(),
      name: z.string().min(1, { message: 'Name is required' }).optional(),
      url: z.string().url({ message: 'Invalid URL format' }).optional(),
      projectIds: z.string().optional(),
      isActive: z.string().optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    let projectIds: number[] | undefined
    try {
      projectIds = input.projectIds ? JSON.parse(input.projectIds) : undefined
    } catch (error) {
      throw new BadRequestError('Invalid project IDs')
    }

    // First get the webhook instance
    const webhook = await getWebhook(input.id, ctx.workspace).then((r) =>
      r.unwrap(),
    )

    const result = await updateWebhook({
      webhook,
      name: input.name,
      url: input.url,
      projectIds,
      isActive: input.isActive === 'true',
    })

    return result.unwrap()
  })
