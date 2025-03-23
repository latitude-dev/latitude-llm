import { Queues, QUEUES } from '@latitude-data/core/jobs/constants'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { captureException } from '$/utils/sentry'
import { Processor } from 'bullmq'
import tracer from '../tracer'

export const buildProcessor =
  (queues: Queues[]): Processor =>
  async (job) => {
    await Promise.all(
      queues.map(async (q) => {
        await Promise.all(
          QUEUES[q].jobs.map(async (j) => {
            if (j === job.name) {
              // TODO: cheating a bit here, we should have a better way to do this
              const jobFn = (jobs as unknown as Record<string, Function>)[j]
              if (jobFn) {
                try {
                  return await tracer.wrap(
                    'bull.process',
                    { resource: job.name },
                    async () => {
                      const span = tracer.scope().active()
                      if (span) {
                        span.addTags({ job_id: job.id })
                      }

                      return await jobFn(job)
                    },
                  )()
                } catch (error) {
                  const unknownError = getUnknownError(error)

                  if (unknownError) {
                    captureException(error as Error)
                    throw error
                  }
                }
              } else {
                throw new NotFoundError(`Job ${job.name} not found`)
              }
            }
          }),
        )
      }),
    )
  }
