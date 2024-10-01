import { setupJobs } from '@latitude-data/jobs'

import { LatitudeEvent } from './handlers'

export const publisher = {
  publishLater: async (event: LatitudeEvent) => {
    const queues = await setupJobs()

    queues.eventsQueue.jobs.enqueueCreateEventJob(event)
    queues.eventsQueue.jobs.enqueuePublishEventJob(event)
    queues.eventsQueue.jobs.enqueuePublishToAnalyticsJob(event)
  },
}
