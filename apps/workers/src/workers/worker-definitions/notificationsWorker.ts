import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { createWorker } from '../utils/createWorker'
import { WORKER_OPTIONS } from '../utils/connectionConfig'

const jobMappings = {
  sendWeeklyEmailJob: jobs.sendWeeklyEmailJob,
}

/**
 * Notifications worker with rate limiting for Mailgun.
 *
 * Rate limit: 90 jobs/minute (~91 emails/minute)
 * This keeps us safely under Mailgun's limits while allowing fast processing.
 */
export function startNotificationsWorker() {
  return createWorker(Queues.notificationsQueue, jobMappings, {
    ...WORKER_OPTIONS,
    limiter: {
      max: 90,
      duration: 60_000,
    },
  })
}
