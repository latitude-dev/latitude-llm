import { Job } from 'bullmq'
import tracer from './tracer'

/**
 * Creates a job handler function for a BullMQ worker
 * @param jobMappings Object mapping job names to their handler functions
 * @returns A function that processes jobs based on the provided mappings
 */
export function createJobHandler<T extends Record<string, Function>>(
  jobMappings: T,
) {
  return async (job: Job, token?: string) => {
    return await tracer.wrap(
      'bullmq.process',
      { resource: job.name },
      async () => {
        const span = tracer.scope().active()
        if (span) {
          span.addTags({
            jobId: job.id,
            jobName: job.name,
            jobQueue: job.queueName,
            jobData: job.data ? JSON.stringify(job.data) : undefined,
          })
        }
        const jobName = job.name
        const jobFunction = jobMappings[jobName as keyof T]
        if (!jobFunction) {
          throw new Error(`Job function not found: ${jobName}`)
        }

        return await jobFunction(job, token)
      },
    )()
  }
}
