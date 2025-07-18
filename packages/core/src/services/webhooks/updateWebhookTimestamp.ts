import { eq } from 'drizzle-orm'
import { NotFoundError } from '../../lib/errors'
import { Result, type TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { webhooks } from '../../schema/models/webhooks'
import { type Webhook } from './types'

export async function updateWebhookTimestamp(
  webhookId: number,
  transaction = new Transaction(),
): Promise<TypedResult<Webhook, Error>> {
  const result = await transaction.call(async (trx) => {
    const [webhook] = await trx
      .update(webhooks)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(webhooks.id, webhookId))
      .returning()

    if (!webhook) {
      return Result.error(new NotFoundError('Webhook not found'))
    }

    return Result.ok(webhook)
  })

  return result
}
