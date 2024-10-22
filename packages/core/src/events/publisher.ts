import { env } from '@latitude-data/env'

import { setupJobs } from '../jobs'
import { LatitudeEvent } from './events'

const publishViaApi = async (event: LatitudeEvent) => {
  const response = await fetch(`${env.LATITUDE_URL}/api/events/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.EVENT_PUBLISHER_API_KEY}`,
    },
    body: JSON.stringify(event),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Failed to publish event: ${errorData.error}`)
  }
}

const publishViaQueues = async (event: LatitudeEvent) => {
  const queues = await setupJobs()

  await Promise.all([
    queues.eventsQueue.jobs.enqueueCreateEventJob(event),
    queues.eventsQueue.jobs.enqueuePublishEventJob(event),
    queues.eventsQueue.jobs.enqueuePublishToAnalyticsJob(event),
  ])
}

export const publisher = {
  publishLater: async (event: LatitudeEvent) => {
    if (env.WORKERS) {
      await publishViaApi(event)
    } else {
      await publishViaQueues(event)
    }
  },
}
