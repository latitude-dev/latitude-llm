import { eq, and } from 'drizzle-orm'

import { database } from '../../../client'
import { webhooks } from '../../../schema/models/webhooks'
import { Events, LatitudeEvent } from '../../../events/events'
import { setupQueues } from '../../queues'

const WEBHOOK_EVENTS: Array<Events> = ['commitPublished']

export async function processWebhookJob({
  data: event,
}: {
  data: LatitudeEvent
}) {
  if (!('workspaceId' in event.data) || !event.data.workspaceId) {
    return // Skip silently as this is an expected condition
  }
  if (!WEBHOOK_EVENTS.includes(event.type as Events)) {
    return // Skip silently as this is an expected condition
  }

  // Get all active webhooks for the workspace
  const activeWebhooks = await database
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.workspaceId, event.data.workspaceId),
        eq(webhooks.isActive, true),
      ),
    )

  const queues = await setupQueues()

  // Enqueue a job for each webhook
  await Promise.all(
    activeWebhooks.map((webhook) =>
      queues.webhooksQueue.jobs.enqueueProcessIndividualWebhookJob({
        event,
        webhookId: webhook.id,
      }),
    ),
  )
}
