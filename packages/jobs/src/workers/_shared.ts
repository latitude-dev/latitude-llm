import { Processor } from 'bullmq'

import { Queues } from '../constants'
import { QUEUES } from '../queues'

export const buildProcessor =
  (queues: Queues[]): Processor =>
  async (job) => {
    await Promise.all(
      queues.map(async (q) => {
        await Promise.all(
          QUEUES[q].jobs.map(async (j) => {
            if (j.name === job.name) {
              await j(job)
            }
          }),
        )
      }),
    )
  }
