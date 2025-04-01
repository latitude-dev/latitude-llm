import { Result, type TypedResult } from '../../lib'
import { type WebhookPayload } from './types'
import { sendWebhook, type WebhookSendResponse } from './sendWebhook'
import { generateWebhookSignature } from './generateSignature'

export interface SendSignedWebhookParams {
  url: string
  secret: string
  payload: WebhookPayload
  additionalHeaders?: Record<string, string>
}

export async function sendSignedWebhook({
  url,
  secret,
  payload,
  additionalHeaders = {},
}: SendSignedWebhookParams): Promise<TypedResult<WebhookSendResponse, Error>> {
  const signature = generateWebhookSignature(payload, secret)

  const response = await sendWebhook({
    url,
    payload,
    headers: {
      'X-Latitude-Signature': signature,
      'X-Webhook-Signature': signature,
      ...additionalHeaders,
    },
  })

  if (!response.success) {
    return Result.error(
      response.error || new Error('Failed to send signed webhook'),
    )
  }

  return Result.ok(response)
}
