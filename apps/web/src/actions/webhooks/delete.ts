'use server'

import { z } from 'zod'
import { deleteWebhook } from '@latitude-data/core/services/webhooks/deleteWebhook'
import { getWebhook } from '@latitude-data/core/services/webhooks/getWebhook'
import { authProcedure } from '../procedures'

export const deleteWebhookAction = authProcedure
  .inputSchema(z.object({ id: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const webhook = await getWebhook(parsedInput.id, ctx.workspace).then((r) =>
      r.unwrap(),
    )

    const result = await deleteWebhook({
      webhook,
    })

    return result.unwrap()
  })
