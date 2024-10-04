import { Job } from 'bullmq'

import { LatitudeEvent } from '../../../events/events'
import { createEvent } from '../../../services/events/create'

export const createEventJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data

  await createEvent(event)
}
