import { setupJobs } from '../jobs'
import { LatitudeEvent } from './events'

export const publisher = {
  publishLater: async (event: LatitudeEvent) => {
    const queues = await setupJobs()

    queues.eventsQueue.jobs.enqueueCreateEventJob(event)
    queues.eventsQueue.jobs.enqueuePublishEventJob(event)
    queues.eventsQueue.jobs.enqueuePublishToAnalyticsJob(event)
  },
}
