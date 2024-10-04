import { Queues, QUEUES } from '@latitude-data/core/jobs/constants'
import { captureException } from '$/utils/sentry'
import { Processor } from 'bullmq'

export const buildProcessor =
  (queues: Queues[]): Processor =>
  async (job) => {
    await Promise.all(
      queues.map(async (q) => {
        await Promise.all(
          QUEUES[q].jobs.map(async (j) => {
            if (j.name === job.name) {
              try {
                await j(job)
              } catch (error) {
                captureException(error as Error)

                throw error
              }
            }
          }),
        )
      }),
    )
  }
