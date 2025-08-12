'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { testWebhookEndpoint } from '@latitude-data/core/services/webhooks/testWebhook'

export const testWebhookAction = authProcedure
  .inputSchema(
    z.object({
      url: z.string().pipe(z.url({ error: 'Invalid URL format' })),
    }),
  )
  .action(async ({ parsedInput }) => {
    const result = await testWebhookEndpoint({
      url: parsedInput.url,
    })

    return result.unwrap()
  })
