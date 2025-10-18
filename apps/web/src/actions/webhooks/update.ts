'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { updateWebhook } from '@latitude-data/core/services/webhooks/updateWebhook'
import { getWebhook } from '@latitude-data/core/services/webhooks/getWebhook'
import { BadRequestError } from '@latitude-data/constants/errors'

export const updateWebhookAction = authProcedure
  .inputSchema(
    z.object({
      id: z.coerce.number(),
      name: z.string().min(1, { error: 'Name is required' }).optional(),
      url: z
        .string()
        .pipe(z.url({ error: 'Invalid URL format' }))
        .optional(),
      projectIds: z.string().optional(),
      isActive: z.string().optional(),
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

    // First get the webhook instance
    const webhook = await getWebhook(parsedInput.id, ctx.workspace).then((r) =>
      r.unwrap(),
    )

    const result = await updateWebhook({
      webhook,
      name: parsedInput.name,
      url: parsedInput.url,
      projectIds,
      isActive: parsedInput.isActive === 'true',
    })

    return result.unwrap()
  })
