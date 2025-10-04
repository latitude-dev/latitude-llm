'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { testWebhookEndpoint } from '@latitude-data/core/services/webhooks/testWebhook'

export const testWebhookAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      url: z.string().url({ message: 'Invalid URL format' }),
    }),
  )
  .handler(async ({ input }) => {
    const result = await testWebhookEndpoint({
      url: input.url,
    })

    return result.unwrap()
  })
