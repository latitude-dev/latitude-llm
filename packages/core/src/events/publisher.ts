import { jobs } from '../jobs'
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
    jobs.queues.eventsQueue.jobs.enqueuePublishEventJob(event)
  },
}
