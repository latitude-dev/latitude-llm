'use server'

import { z } from 'zod'

import { withAdmin } from '../../../procedures'
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
    if (!env.EMAIL_TRIGGER_DOMAIN) {
      throw new Error('EMAIL_TRIGGER_DOMAIN is not set')
    }

    try {
      fetch(
        `http://${env.GATEWAY_HOSTNAME}:${env.GATEWAY_PORT}/webhook/email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: input.recipient,
            sender: input.sender,
            subject: input.subject,
            'plain-body': input.body,
          }),
        },
      )
    } catch (error) {
      throw new Error((error as Error).message)
    }
  })
