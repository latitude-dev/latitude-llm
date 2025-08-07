import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result, type TypedResult } from '../../lib/Result'
import { webhookDeliveries } from '../../schema/models/webhooks'
import { type WebhookDelivery } from './types'

export async function listWebhookDeliveries(
  webhookId: number,
  db = database,
): Promise<TypedResult<WebhookDelivery[], never>> {
  const deliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(webhookDeliveries.createdAt)

  return Result.ok(deliveries)
}
