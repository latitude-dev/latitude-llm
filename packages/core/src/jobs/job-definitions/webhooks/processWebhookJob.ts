import { and, eq } from 'drizzle-orm'

import { database } from '../../../client'
import { Events, LatitudeEvent } from '../../../events/events'
import { webhooks } from '../../../schema/models/webhooks'
import { webhooksQueue } from '../../queues'

export const WEBHOOK_EVENTS: Array<Events> = [
  'commitPublished',
  'documentLogCreated',
]

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

  // Enqueue a job for each webhook
  await Promise.all(
    activeWebhooks.map((webhook) => {
      webhooksQueue.add('processIndividualWebhookJob', {
        event,
        webhookId: webhook.id,
      })
    }),
  )
}
