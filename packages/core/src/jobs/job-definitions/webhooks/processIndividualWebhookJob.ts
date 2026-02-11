import { Job } from 'bullmq'
import { eq } from 'drizzle-orm'

import { database } from '../../../client'
import { webhooks } from '../../../schema/models/webhooks'
import { events } from '../../../schema/models/events'
import {
  createWebhookDelivery,
  sendSignedWebhook,
} from '../../../services/webhooks'
import { Events, LatitudeEvent } from '../../../events/events'
import { processWebhookPayload } from './utils/processWebhookPayload'
import { WEBHOOK_EVENTS } from './processWebhookJob'
import { SpansRepository } from '../../../repositories'

export type ProcessIndividualWebhookJobData = {
  event: typeof events.$inferSelect
  webhookId: number
}

export const processIndividualWebhookJob = async (
  job: Job<ProcessIndividualWebhookJobData>,
) => {
  const { event, webhookId } = job.data

  // Get the webhook and event
  const [webhook] = await database
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))

  if (!webhook || !webhook.isActive) {
    throw new Error(`Webhook not found or inactive: ${webhookId}`)
  }

  // Extract projectId from the event (best-effort)
  const projectId = await fetchProjectIdFromEvent(event as LatitudeEvent)

  // Check if the webhook has project filters and if the event's projectId matches.
  // If we cannot resolve a projectId (e.g., related record already deleted), skip
  // filtered webhooks to avoid pointless retries/noise.
  if (webhook.projectIds && webhook.projectIds.length > 0) {
    if (!projectId) return
    if (!webhook.projectIds.includes(projectId)) return
  }

  // Create webhook payload
  const payload = await processWebhookPayload(event as LatitudeEvent).then(
    (r) => r.unwrap(),
  )

  try {
    // Send signed webhook
    const result = await sendSignedWebhook({
      url: webhook.url,
      secret: webhook.secret,
      payload,
    })

    if (!result.ok) {
      throw result.error
    }

    const response = result.value
    if (!response) {
      throw new Error('No response received from webhook')
    }

    // Create delivery record
    await createWebhookDelivery({
      webhookId: webhook.id,
      eventType: event.type as Events,
      status: response.success ? 'success' : 'failed',
      responseStatus: response.statusCode,
      responseBody: response.responseBody,
      errorMessage: response.error?.message,
    })
  } catch (error) {
    // Create failed delivery record
    await createWebhookDelivery({
      webhookId: webhook.id,
      eventType: event.type as Events,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

async function fetchProjectIdFromEvent(event: LatitudeEvent) {
  if (!WEBHOOK_EVENTS.includes(event.type as Events)) {
    return
  }

  switch (event.type) {
    case 'commitPublished':
      return event.data.commit.projectId
    case 'spanCreated': {
      const { spanId, traceId, workspaceId } = event.data
      const repo = new SpansRepository(workspaceId)
      const spanResult = await repo.get({ spanId, traceId })

      // The originating record may have been deleted between event creation and
      // webhook processing; treat as non-fatal (no projectId).
      if (!spanResult.ok || !spanResult.value) return

      return spanResult.value.projectId
    }
    default:
      return
  }
}
