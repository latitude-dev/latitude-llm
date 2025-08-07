import type { Job } from 'bullmq'

import type { LatitudeEvent } from '../../../events/events'
import { createEvent } from '../../../services/events/create'

export const createEventJob = async (job: Job<LatitudeEvent>) => {
  const event = job.data

  await createEvent(event)
}
