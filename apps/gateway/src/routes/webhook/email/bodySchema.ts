import { z } from '@hono/zod-openapi'

// https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/#parsed-messages-parameters
export const emailWebhookBodySchema = z.object({
  recipient: z.string(), // Recipient email address
  sender: z.string(), // Sender email address
  subject: z.string(),
  'body-plain': z.string(), // Body as plain text
  'stripped-html': z.string(), // Body as HTML
  'Message-Id': z.string(),
  token: z.string(),
  timestamp: z.string(),
  signature: z.string(),
})
