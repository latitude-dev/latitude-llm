import {
  EventHandlers,
  LatitudeEvent,
} from '@latitude-data/core/events/handlers/index'
import { Job } from 'bullmq'

import { setupJobs } from '../..'

export const publishEventJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data
  const handlers = EventHandlers[event.type]
  if (!handlers?.length) return

  handlers.forEach((handler) => {
    const queues = setupJobs()

    queues.eventsQueue.queue.add(handler.name, event)
  })
}
