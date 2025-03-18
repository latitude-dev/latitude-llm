import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { LatitudeEvent } from '../../../events/events'
import { PostHogClient } from '../../../services/posthog'

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
  if (env.NODE_ENV === 'development') {
    console.log('Analytics event captured:', event.type)
  }

  const client = PostHogClient()
  if (!client) return

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
