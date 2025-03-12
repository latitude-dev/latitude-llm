'use server'

import { z } from 'zod'

import { withAdmin } from '../../../procedures'
import { handleEmailTrigger } from '../../../../../../../packages/core/src/services/documentTriggers/handlers/email'
import { env } from 'process'

export const manualEmailTriggerAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      recipient: z.string().email(),
      senderEmail: z.string().email(),
      senderName: z.string(),
      subject: z.string(),
      body: z.string(),
      messageId: z.string().optional(),
      references: z.string().optional(),
      files: z.array(z.union([z.string(), z.instanceof(File)])).optional(),
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
      senderEmail: input.senderEmail,
      senderName: input.senderName,
      messageId: input.messageId?.length ? input.messageId : undefined,
      parentMessageIds: input.references?.length
        ? input.references.split(' ')
        : undefined,
      attachments: input.files,
    })

    return {}
  })
