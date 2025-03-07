import { z } from '@hono/zod-openapi'

// https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/#parsed-messages-parameters
export const emailWebhookBodySchema = z.object({
  recipient: z.string().openapi({ description: 'The recipient email address' }),
  sender: z.string().openapi({ description: 'The sender email address' }),
  subject: z.string().openapi({ description: 'The email subject' }),
  'plain-body': z
    .string()
    .openapi({ description: 'The plain text email body' }),
})
