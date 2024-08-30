import { env } from '@latitude-data/env'
import { setupJobs } from '@latitude-data/jobs'

import { EventHandler, EventHandlers, LatitudeEvent } from './handlers'

let jobs: ReturnType<typeof setupJobs>

export const publisher = {
  publish: async (event: LatitudeEvent) => {
    const handlers = EventHandlers[event.type] as EventHandler<typeof event>[]
    if (!handlers?.length) return

    return await Promise.all(
      handlers.map((handler) => handler({ data: event })),
    )
  },
  publishLater: (event: LatitudeEvent) => {
    if (!jobs) {
      jobs = setupJobs({
        connectionParams: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
        },
      })
    }

    jobs.queues.eventsQueue.jobs.enqueuePublishEventJob(event)
  },
}
