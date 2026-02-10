import { eq, and } from 'drizzle-orm'

import { database } from '../../../client'
import { webhooks } from '../../../schema/models/webhooks'
import { Events, LatitudeEvent } from '../../../events/events'
import { queues } from '../../queues'

export const WEBHOOK_EVENTS: Array<Events> = ['commitPublished', 'spanCreated']

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

  // Only process spanCreated events that are conversation roots (completed prompt runs)
  if (
    event.type === 'spanCreated' &&
    !('isConversationRoot' in event.data && event.data.isConversationRoot)
  ) {
    return // Skip non-root spans
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
    activeWebhooks.map(async (webhook) => {
      const { webhooksQueue } = await queues()
      return webhooksQueue.add('processIndividualWebhookJob', {
        event,
        webhookId: webhook.id,
      })
    }),
  )
}
