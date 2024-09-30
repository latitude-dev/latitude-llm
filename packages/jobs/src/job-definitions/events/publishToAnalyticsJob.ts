import { LatitudeEvent } from '@latitude-data/core/events/handlers/index'
import { PostHogClient } from '@latitude-data/core/services/posthog'
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

  const client = PostHogClient()

  if (!userEmail && !workspaceId) return
  if (!userEmail) {
    client.capture({
      distinctId: `workspace:${workspaceId}`,
      event: event.type,
      properties: {
        data: event.data,
        workspaceId,
      },
    })
  } else {
    client.capture({
      distinctId: userEmail,
      event: event.type,
      properties: {
        data: event.data,
        workspaceId,
      },
    })
  }

  await client.shutdown()
}
