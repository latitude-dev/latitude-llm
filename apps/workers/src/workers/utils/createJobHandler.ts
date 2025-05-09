import { captureException } from '@latitude-data/core/workers/sentry'
import { Job } from 'bullmq'

/**
 * Creates a job handler function for a BullMQ worker
 * @param jobMappings Object mapping job names to their handler functions
 * @returns A function that processes jobs based on the provided mappings
 */
export function createJobHandler<T extends Record<string, Function>>(
  jobMappings: T,
) {
  return async (job: Job) => {
    const jobName = job.name
    const jobFunction = jobMappings[jobName as keyof T]
    if (!jobFunction) {
      throw new Error(`Job function not found: ${jobName}`)
    }

    try {
      return await jobFunction(job)
    } catch (error) {
      captureException(error as Error)

      throw error
    }
  }
}
