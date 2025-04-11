import { randomBytes } from 'crypto'

import { database } from '../../client'
import { webhooks } from '../../schema/models/webhooks'
import { UnprocessableEntityError } from '../../lib/errors'
import { type CreateWebhookParams, type Webhook } from './types'
import { type Database } from '../../client'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function createWebhook(
  params: CreateWebhookParams,
  db = database,
): Promise<TypedResult<Webhook, Error>> {
  return Transaction.call<Webhook>(async (tx: Database) => {
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
  }, db)
}
