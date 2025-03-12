import { z } from '@hono/zod-openapi'

// https://mailgun-docs.redoc.ly/docs/mailgun/user-manual/receive-forward-store/#storing-and-retrieving-messages
export const emailWebhookBodySchema = z.object({
  recipient: z.string(), // Recipient email address
  sender: z.string(), // Sender email address
  from: z.string(), // Sender name and email
  subject: z.string(),
  'body-plain': z.string(), // Body as plain text
  'stripped-text': z.string().optional(), // Body as text without quoted replies
  'stripped-signature': z.string().optional(), // Signature as plain text
  'Message-Id': z.string().optional(), // The identifier of the user message
  References: z.string().optional(), // Includes all Message-Ids of the parent messages, split by spaces
  token: z.string().optional(),
  timestamp: z.string().optional(),
  signature: z.string().optional(),
})

export type EmailWebhookBodySchema = z.infer<typeof emailWebhookBodySchema>
