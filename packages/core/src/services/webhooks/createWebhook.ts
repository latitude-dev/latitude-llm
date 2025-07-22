import { randomBytes } from 'crypto'

import { UnprocessableEntityError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { webhooks } from '../../schema/models/webhooks'
import { type CreateWebhookParams, type Webhook } from './types'

export async function createWebhook(
  params: CreateWebhookParams,
  transaction = new Transaction(),
): Promise<TypedResult<Webhook, Error>> {
  return transaction.call<Webhook>(async (tx) => {
    const { workspaceId, name, url, projectIds = [], isActive } = params

    // Validate URL
    try {
      new URL(url)
    } catch {
      return Result.error(new UnprocessableEntityError('Invalid webhook URL'))
    }

    // Generate a random secret for HMAC signing
    const secret = randomBytes(32).toString('hex')

    const [webhook] = await tx
      .insert(webhooks)
      .values([
        {
          workspaceId,
          name,
          url,
          secret,
          projectIds,
          isActive,
        },
      ])
      .returning()

    if (!webhook) {
      return Result.error(
        new UnprocessableEntityError('Failed to create webhook'),
      )
    }

    return Result.ok(webhook)
  })
}
