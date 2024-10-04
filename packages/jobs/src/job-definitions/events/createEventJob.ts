import { LatitudeEvent } from '@latitude-data/core/events/events.d'
import { createEvent } from '@latitude-data/core/services/events/create'
import { Job } from 'bullmq'

export const createEventJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data

  await createEvent(event)
}
