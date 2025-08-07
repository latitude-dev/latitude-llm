import type { Events } from '../../events/events'
import { publisher } from '../../events/publisher'
import { Result, type TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { webhookDeliveries } from '../../schema/models/webhooks'
import type { WebhookDelivery } from './types'

export async function createWebhookDelivery(
  params: {
    webhookId: number
    eventType: Events
    status: 'success' | 'failed'
    responseStatus?: number
    responseBody?: string
    errorMessage?: string
    nextRetryAt?: Date
  },
  transaction = new Transaction(),
): Promise<TypedResult<WebhookDelivery, Error>> {
  const result = await transaction.call(async (tx) => {
    const [delivery] = await tx
      .insert(webhookDeliveries)
      .values({
        webhookId: params.webhookId,
        eventType: params.eventType,
        status: params.status,
        responseStatus: params.responseStatus,
        responseBody: params.responseBody,
        errorMessage: params.errorMessage,
        nextRetryAt: params.nextRetryAt,
      })
      .returning()

    if (!delivery) {
      return Result.error(new Error('Failed to create webhook delivery'))
    }

    return Result.ok(delivery)
  })

  publisher.publishLater({
    type: 'webhookDeliveryCreated',
    data: params,
  })

  return result
}
