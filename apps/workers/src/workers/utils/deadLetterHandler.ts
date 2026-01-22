import { Job, Queue } from 'bullmq'
import { queues } from '@latitude-data/core/queues'
import { recordDeadLetterMetric } from './jobMetrics'
import { captureException, captureMessage } from './captureException'

export type DeadLetterJobData = {
  originalQueue: string
  originalJobName: string
  originalJobId: string | undefined
  originalJobData: unknown
  failedAt: string
  errorMessage: string
  errorName: string
  errorStack: string | undefined
  attemptsMade: number
  maxAttempts: number
  correlationId: string
}

/**
 * Moves a failed job to the dead-letter queue for later inspection and potential reprocessing.
 * This is called when a job exhausts all retry attempts.
 */
export async function moveToDeadLetterQueue(
  job: Job,
  error: Error,
): Promise<void> {
  const correlationId = job.id || `${job.queueName}-${Date.now()}`

  const deadLetterData: DeadLetterJobData = {
    originalQueue: job.queueName,
    originalJobName: job.name,
    originalJobId: job.id,
    originalJobData: job.data,
    failedAt: new Date().toISOString(),
    errorMessage: error.message,
    errorName: error.name,
    errorStack: error.stack,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts?.attempts || 1,
    correlationId,
  }

  try {
    const { deadLetterQueue } = await queues()

    await deadLetterQueue.add('deadLetterJob', deadLetterData, {
      jobId: `dlq-${correlationId}-${Date.now()}`,
      removeOnComplete: false,
      removeOnFail: false,
    })

    recordDeadLetterMetric(job.queueName, job.name, error.name)

    captureMessage(
      `Job moved to dead-letter queue: ${job.name}`,
      'warning',
      {
        originalQueue: job.queueName,
        originalJobName: job.name,
        originalJobId: job.id,
        correlationId,
        errorName: error.name,
        errorMessage: error.message,
      },
    )
  } catch (dlqError) {
    captureException(dlqError as Error, {
      context: 'Failed to move job to dead-letter queue',
      originalQueue: job.queueName,
      originalJobName: job.name,
      originalJobId: job.id,
      correlationId,
    })
  }
}

/**
 * Checks if a job should be moved to the dead-letter queue.
 * Returns true if the job has exhausted all retry attempts.
 */
export function shouldMoveToDeadLetter(job: Job): boolean {
  const maxAttempts = job.opts?.attempts || 1
  return job.attemptsMade >= maxAttempts
}

/**
 * Retrieves dead letter jobs for inspection.
 */
export async function getDeadLetterJobs(
  start = 0,
  end = 100,
): Promise<Job<DeadLetterJobData>[]> {
  const { deadLetterQueue } = await queues()
  return deadLetterQueue.getJobs(['failed', 'waiting', 'delayed'], start, end) as Promise<Job<DeadLetterJobData>[]>
}

/**
 * Retries a dead letter job by adding it back to its original queue.
 */
export async function retryDeadLetterJob(
  deadLetterJob: Job<DeadLetterJobData>,
): Promise<void> {
  const { originalQueue, originalJobName, originalJobData, correlationId } =
    deadLetterJob.data
  const allQueues = await queues()
  const targetQueue = allQueues[
    `${originalQueue}Queue` as keyof typeof allQueues
  ] as Queue | undefined

  if (!targetQueue) {
    throw new Error(`Original queue not found: ${originalQueue}`)
  }

  await targetQueue.add(originalJobName, originalJobData, {
    jobId: `retry-${correlationId}-${Date.now()}`,
  })

  await deadLetterJob.remove()

  captureMessage(
    `Dead letter job retried: ${originalJobName}`,
    'info',
    {
      originalQueue,
      originalJobName,
      correlationId,
    },
  )
}

/**
 * Removes a dead letter job permanently.
 */
export async function removeDeadLetterJob(
  deadLetterJob: Job<DeadLetterJobData>,
): Promise<void> {
  const { originalQueue, originalJobName, correlationId } = deadLetterJob.data

  await deadLetterJob.remove()

  captureMessage(
    `Dead letter job removed: ${originalJobName}`,
    'info',
    {
      originalQueue,
      originalJobName,
      correlationId,
    },
  )
}
