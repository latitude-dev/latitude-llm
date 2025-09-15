import { Job } from 'bullmq'

import { LatitudeEvent } from '../../../events/events'
import { EventHandlers } from '../../../events/handlers/index'
import { queues } from '../../queues'

export const publishEventJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data
  const { eventHandlersQueue } = await queues()

  // Async handlers
  const handlers = EventHandlers[event.type]
  if (!handlers?.length) return

  handlers.forEach((handler) => {
    eventHandlersQueue.add(handler.name, event)
  })
}
