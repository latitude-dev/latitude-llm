'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { deleteWebhook } from '@latitude-data/core'
import { getWebhook } from '@latitude-data/core'

export const deleteWebhookAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    // First get the webhook instance
    const webhook = await getWebhook(input.id, ctx.workspace).then((r) =>
      r.unwrap(),
    )

    const result = await deleteWebhook({
      webhook,
    })

    return result.unwrap()
  })
