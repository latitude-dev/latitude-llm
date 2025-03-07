import { AppRouteHandler } from '$/openApi/types'
import { handleEmailTrigger } from '@latitude-data/core/services/documentTriggers/handlers/email'
import { EmailWebhookRoute } from './webhook.route'

// @ts-expect-error: streamSSE has type issues with zod-openapi
// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
export const emailWebhookHandler: AppRouteHandler<EmailWebhookRoute> = async (
  c,
) => {
  const { recipient, subject, 'plain-body': body, sender } = c.req.valid('json')

  await handleEmailTrigger({
    recipient,
    subject,
    body,
    sender,
  }).then((r) => r.unwrap())

  return c.json({})
}
