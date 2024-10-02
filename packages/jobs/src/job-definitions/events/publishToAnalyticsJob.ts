import { LatitudeEvent } from '@latitude-data/core/events/handlers/index'
import { PostHogClient } from '@latitude-data/core/services/posthog'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

export const publishToAnalyticsJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data
  let userEmail, workspaceId
  if ('userEmail' in event.data) {
    userEmail = event.data.userEmail
  }
  if ('workspaceId' in event.data) {
    workspaceId = event.data.workspaceId
  }

  if (!userEmail) return

  if (env.NODE_ENV !== 'production') {
    console.log('Analytics event captured:', event.type)

    return
  }

  const client = PostHogClient()

  client.capture({
    distinctId: userEmail,
    event: event.type,
    properties: {
      data: event.data,
      workspaceId,
    },
  })

  await client.shutdown()
}
