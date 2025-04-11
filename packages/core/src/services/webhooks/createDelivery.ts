import { database } from '../../client'
import { webhookDeliveries } from '../../schema/models/webhooks'
import { Result, type TypedResult } from '../../lib/Result'
import { publisher } from '../../events/publisher'
import Transaction from './../../lib/Transaction'
import { WebhookDelivery } from './types'
import { Events } from '../../events/events'

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
  db = database,
): Promise<TypedResult<WebhookDelivery, Error>> {
  const result = await Transaction.call(async (tx) => {
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
  }, db)

  publisher.publishLater({
    type: 'webhookDeliveryCreated',
    data: params,
  })

  return result
}
