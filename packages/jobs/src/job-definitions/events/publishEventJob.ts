import {
  EventHandlers,
  LatitudeEvent,
} from '@latitude-data/core/events/handlers/index'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { buildConnection } from '../../connection'
import { setupQueues } from '../../queues'

let queues: ReturnType<typeof setupQueues>

export const publishEventJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data
  const handlers = EventHandlers[event.type]
  if (!handlers?.length) return

  handlers.forEach((handler) => {
    if (!queues) {
      const connection = buildConnection({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
      })

      queues = setupQueues({ connection })
    }

    queues.eventsQueue.queue.add(handler.name, event)
  })
}
