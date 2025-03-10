import { AppRouteHandler } from '$/openApi/types'
import { handleEmailTrigger } from '@latitude-data/core/services/documentTriggers/handlers/email'
import { verifyWebhookSignature } from '@latitude-data/core/services/documentTriggers/helpers/verifySignature'
import { EmailWebhookRoute } from './webhook.route'
import { env } from '@latitude-data/env'
import { UnauthorizedError } from '@latitude-data/core/lib/errors'

// @ts-expect-error: streamSSE has type issues with zod-openapi
// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
export const emailWebhookHandler: AppRouteHandler<EmailWebhookRoute> = async (
  c,
) => {
  const {
    recipient,
    subject,
    'body-plain': body,
    sender,
    token,
    timestamp,
    signature,
    'Message-Id': messageId,
  } = c.req.valid('json')

  if (!env.MAILGUN_WEBHOOK_SIGNING_KEY) {
    throw new UnauthorizedError('Env MAILGUN_WEBHOOK_SIGNING_KEY missing.')
  }

  verifyWebhookSignature({
    token,
    timestamp,
    signature,
    signingKey: env.MAILGUN_WEBHOOK_SIGNING_KEY,
  }).unwrap()

  const result = await handleEmailTrigger({
    recipient,
    subject,
    body,
    sender,
    messageId,
  })

  if (result.error) {
    // Mailgun will retry the POST request if it receives any response code other than 200 or 406
    // https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/#receiving-messages-via-http-through-a-forward-action
    return c.json({ error: result.error.message }, 406)
  }

  return c.json({ success: true }, 200)
}
