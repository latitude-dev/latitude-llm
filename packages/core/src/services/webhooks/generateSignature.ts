import { createHmac } from 'node:crypto'

import type { WebhookPayload } from './types'

export function generateWebhookSignature(payload: WebhookPayload, secret: string): string {
  const payloadString = JSON.stringify(payload)
  return createHmac('sha256', secret).update(payloadString).digest('hex')
}
