import { z } from '@hono/zod-openapi'

// https://mailgun-docs.redoc.ly/docs/mailgun/user-manual/receive-forward-store/#storing-and-retrieving-messages
export const emailWebhookBodySchema = z.object({
  recipient: z.string(), // Recipient email address
  sender: z.string(), // Sender email address
  from: z.string(), // Sender name and email
  subject: z.string(),
  'body-plain': z.string(), // Body as plain text
  'stripped-html': z.string().optional(), // Body as HTML
  'Message-Id': z.string().optional(),
  token: z.string().optional(),
  timestamp: z.string().optional(),
  signature: z.string().optional(),
})

export type EmailWebhookBodySchema = z.infer<typeof emailWebhookBodySchema>
