import tracer from 'dd-trace'

export type JobMetricsData = {
  queueName: string
  jobName: string
  correlationId: string
  queueWaitMs: number
  executionMs: number
  totalMs: number
  attemptNumber: number
  success: boolean
  errorType?: string
}

/**
 * Records job metrics to DataDog via span tags and metrics API.
 * Tracks queue wait time, execution duration, and success/failure rates.
 */
export function recordJobMetrics(metrics: JobMetricsData): void {
  const span = tracer.scope().active()

  const tags = [
    `queue_name:${metrics.queueName}`,
    `job_name:${metrics.jobName}`,
    `attempt_number:${metrics.attemptNumber}`,
    `success:${metrics.success}`,
    `error_type:${metrics.errorType || 'none'}`,
  ]

  if (span) {
    span.addTags({
      'job.queue_wait_ms': metrics.queueWaitMs,
      'job.execution_ms': metrics.executionMs,
      'job.total_ms': metrics.totalMs,
      'job.attempt_number': metrics.attemptNumber,
      'job.success': metrics.success,
      'job.error_type': metrics.errorType,
      'job.correlation_id': metrics.correlationId,
    })
  }

  tracer.dogstatsd.histogram('bullmq.job.queue_wait_ms', metrics.queueWaitMs, tags)
  tracer.dogstatsd.histogram('bullmq.job.execution_ms', metrics.executionMs, tags)
  tracer.dogstatsd.histogram('bullmq.job.total_ms', metrics.totalMs, tags)
  tracer.dogstatsd.increment(
    metrics.success ? 'bullmq.job.success' : 'bullmq.job.failure',
    1,
    tags,
  )

  if (metrics.attemptNumber > 1) {
    tracer.dogstatsd.increment('bullmq.job.retry', 1, tags)
  }
}

/**
 * Records when a job is moved to the dead-letter queue.
 */
export function recordDeadLetterMetric(
  queueName: string,
  jobName: string,
  errorType: string,
): void {
  const tags = [
    `queue_name:${queueName}`,
    `job_name:${jobName}`,
    `error_type:${errorType}`,
  ]
  tracer.dogstatsd.increment('bullmq.job.dead_letter', 1, tags)
}

/**
 * Records current queue depth for monitoring.
 */
export function recordQueueDepth(queueName: string, depth: number): void {
  const tags = [`queue_name:${queueName}`]
  tracer.dogstatsd.gauge('bullmq.queue.depth', depth, tags)
}

/**
 * Records worker concurrency utilization.
 */
export function recordWorkerConcurrency(
  queueName: string,
  activeJobs: number,
  maxConcurrency: number,
): void {
  const utilization = maxConcurrency > 0 ? activeJobs / maxConcurrency : 0
  const tags = [`queue_name:${queueName}`]
  tracer.dogstatsd.gauge('bullmq.worker.active_jobs', activeJobs, tags)
  tracer.dogstatsd.gauge('bullmq.worker.utilization', utilization, tags)
}
