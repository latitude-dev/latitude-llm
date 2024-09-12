import { setupJobs } from '@latitude-data/jobs'

import { EventHandler, EventHandlers, LatitudeEvent } from './handlers'

export const publisher = {
  publish: async (event: LatitudeEvent) => {
    const handlers = EventHandlers[event.type] as EventHandler<typeof event>[]
    if (!handlers?.length) return

    return await Promise.all(
      handlers.map((handler) => handler({ data: event })),
    )
  },
  publishLater: (event: LatitudeEvent) => {
    const queues = setupJobs()

    queues.eventsQueue.jobs.enqueueCreateEventJob(event)
    queues.eventsQueue.jobs.enqueuePublishEventJob(event)
  },
}
