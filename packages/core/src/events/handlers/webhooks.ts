import { eq } from 'drizzle-orm'
import { database } from '../../client'
import { webhooks } from '../../schema/models/webhooks'
import { type WebhookDeliveryCreatedEvent } from '../events'

export async function updateWebhookLastTriggeredAt({
  data,
}: {
  data: WebhookDeliveryCreatedEvent
}) {
  if (data.data.status === 'success') {
    await database
      .update(webhooks)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(webhooks.id, data.data.webhookId))
  }
}
