import { AppRouteHandler } from '$/openApi/types'
import { verifyWebhookSignature } from '@latitude-data/core/services/documentTriggers/helpers/verifySignature'
import { extractEmailSender } from '@latitude-data/core/services/documentTriggers/helpers/extractEmailSender'
import { EmailWebhookRoute } from './webhook.route'
import { env } from '@latitude-data/env'
import { UnauthorizedError } from '@latitude-data/constants/errors'
import { EmailWebhookBodySchema } from './bodySchema'
import { registerEmailTriggerEvent } from '@latitude-data/core/services/documentTriggers/handlers/email/registerEvent'

// @ts-expect-error: streamSSE has type issues with zod-openapi
// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
export const emailWebhookHandler: AppRouteHandler<EmailWebhookRoute> = async (
  c,
) => {
  const formData = await c.req.formData()
  const data = Object.fromEntries(formData.entries())
  const {
    recipient,
    sender,
    from,
    subject,
    'body-plain': plainBody,
    'stripped-text': strippedText,
    'stripped-signature': strippedSignature,
    token,
    timestamp,
    signature,
    'Message-Id': messageId,
    References,
  } = data as EmailWebhookBodySchema

  if (!env.MAILGUN_WEBHOOK_SIGNING_KEY) {
    throw new UnauthorizedError('Env MAILGUN_WEBHOOK_SIGNING_KEY missing.')
  }

  const attachedFiles = await c.req.parseBody()
  const attachments = Object.values(attachedFiles).filter(
    (item) => typeof item !== 'string',
  )

  verifyWebhookSignature({
    token,
    timestamp,
    signature,
    signingKey: env.MAILGUN_WEBHOOK_SIGNING_KEY,
  }).unwrap()

  const { email: senderEmail, name: senderName } = extractEmailSender({
    from,
    sender,
  })

  const parentMessageIds = References?.split(' ')

  // If included, use only the stripped text (and signature if available).
  // Otherwise, the plain body usually contains the full email with quoted replies, which is not necessary.
  const body = strippedText
    ? [strippedText, strippedSignature].filter(Boolean).join('\n')
    : plainBody

  const result = await registerEmailTriggerEvent({
    recipient,
    senderEmail,
    senderName,
    subject,
    body,
    messageId,
    parentMessageIds,
    attachments,
  })

  if (result.error) {
    // Mailgun will retry the POST request if it receives any response code other than 200 or 406
    // https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/#receiving-messages-via-http-through-a-forward-action
    return c.json({ error: result.error.message }, 406)
  }

  return c.json({ success: true }, 200)
}
