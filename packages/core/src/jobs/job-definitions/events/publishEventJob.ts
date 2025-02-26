import { Job } from 'bullmq'

import { setupJobs } from '../..'
import { LatitudeEvent } from '../../../events/events'
import { EventHandlers } from '../../../events/handlers/index'

export const publishEventJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data
  const handlers = EventHandlers[event.type]
  if (!handlers?.length) return

  const queues = await setupJobs()
  const jobs = await queues.eventsQueue.queue.getJobs()

  console.log("RUNNING_JOB", jobs)

  handlers.forEach((handler) => {
    console.log('Enqueueing handler:', handler.name)
    queues.eventsQueue.queue.add(handler.name, event)
  })
}
