'use server'

import { z } from 'zod'

import { withAdmin } from '../../../procedures'
import { handleEmailTrigger } from '@latitude-data/core/services/documentTriggers/handlers/email'
import { env } from 'process'

export const manualEmailTriggerAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      recipient: z.string().email(),
      sender: z.string().email(),
      subject: z.string(),
      body: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    if (!env.GATEWAY_HOSTNAME) {
      throw new Error('GATEWAY_HOSTNAME is not set')
    }
    if (!env.GATEWAY_PORT) {
      throw new Error('GATEWAY_PORT is not set')
    }

    handleEmailTrigger({
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      sender: input.sender,
    })

    return {}
  })
