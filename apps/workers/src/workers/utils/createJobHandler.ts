import { Job } from 'bullmq'
import tracer from './tracer'
import { createJobLogger, JobLogger } from './jobLogger'
import { recordJobMetrics } from './jobMetrics'

export type JobHandlerContext = {
  logger: JobLogger
  correlationId: string
}

export type JobHandlerFunction<TData = unknown, TResult = unknown> = (
  job: Job<TData, TResult>,
  token?: string,
  context?: JobHandlerContext,
) => Promise<TResult | undefined>

/**
 * Creates a job handler function for a BullMQ worker with enhanced observability.
 * Adds correlation IDs, structured logging, and metrics tracking.
 * @param jobMappings Object mapping job names to their handler functions
 * @returns A function that processes jobs based on the provided mappings
 */
export function createJobHandler<T extends Record<string, Function>>(
  jobMappings: T,
) {
  return async (job: Job, token?: string) => {
    const correlationId = job.id || `${job.queueName}-${Date.now()}`
    const attemptNumber = job.attemptsMade + 1
    const maxAttempts = job.opts?.attempts || 1
    const queuedAt = job.timestamp || Date.now()
    const startedAt = Date.now()
    const queueWaitMs = startedAt - queuedAt

    const logger = createJobLogger({
      correlationId,
      jobId: job.id,
      jobName: job.name,
      queueName: job.queueName,
      attemptNumber,
      maxAttempts,
    })

    const context: JobHandlerContext = { logger, correlationId }

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
            correlationId,
            attemptNumber,
            maxAttempts,
            queueWaitMs,
            jobData: job.data ? JSON.stringify(job.data) : undefined,
          })
        }

        logger.info('Job started', {
          queueWaitMs,
          dataKeys: job.data ? Object.keys(job.data) : [],
        })

        const jobName = job.name
        const jobFunction = jobMappings[jobName as keyof T]
        if (!jobFunction) {
          const error = new Error(`Job function not found: ${jobName}`)
          logger.error('Job function not found', error)
          throw error
        }

        let errorType: string | undefined

        try {
          const result = await jobFunction(job, token, context)

          const executionMs = Date.now() - startedAt
          logger.info('Job completed', {
            executionMs,
            totalMs: queueWaitMs + executionMs,
          })

          recordJobMetrics({
            queueName: job.queueName,
            jobName: job.name,
            correlationId,
            queueWaitMs,
            executionMs,
            totalMs: queueWaitMs + executionMs,
            attemptNumber,
            success: true,
          })

          return result
        } catch (error) {
          const executionMs = Date.now() - startedAt
          errorType = (error as Error)?.name || 'UnknownError'

          const isLastAttempt = attemptNumber >= maxAttempts
          logger.error(
            isLastAttempt ? 'Job failed (final attempt)' : 'Job failed (will retry)',
            error as Error,
            {
              executionMs,
              totalMs: queueWaitMs + executionMs,
              isLastAttempt,
            },
          )

          recordJobMetrics({
            queueName: job.queueName,
            jobName: job.name,
            correlationId,
            queueWaitMs,
            executionMs,
            totalMs: queueWaitMs + executionMs,
            attemptNumber,
            success: false,
            errorType,
          })

          throw error
        }
      },
    )()
  }
}
