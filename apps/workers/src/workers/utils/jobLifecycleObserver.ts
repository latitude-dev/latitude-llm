import { Worker, QueueEvents } from 'bullmq'
import tracer from 'dd-trace'
import { env } from '@latitude-data/env'
import { WORKER_CONNECTION_CONFIG } from './connectionConfig'
import { REDIS_KEY_PREFIX } from '@latitude-data/core/redis'
import { recordQueueDepth, recordWorkerConcurrency } from './jobMetrics'

type JobLifecycleEventData = {
  timestamp: string
  queueName: string
  jobId: string | undefined
  jobName: string
  correlationId: string
  workspaceId?: number
  [key: string]: unknown
}

type JobLifecycleEvent =
  | 'job:waiting'
  | 'job:active'
  | 'job:completed'
  | 'job:failed'
  | 'job:stalled'
  | 'job:progress'
  | 'job:removed'
  | 'job:delayed'

const SERVICE_NAME = 'latitude-llm-workers'

function shouldLog(): boolean {
  return env.NODE_ENV !== 'test'
}

function emitLifecycleLog(event: JobLifecycleEvent, data: JobLifecycleEventData): void {
  if (!shouldLog()) return

  const { timestamp, ...rest } = data
  const logEntry = {
    timestamp,
    level: event.includes('failed') || event.includes('stalled') ? 'warn' : 'info',
    message: `Job lifecycle: ${event}`,
    service: SERVICE_NAME,
    event,
    ...rest,
  }

  if (event.includes('failed') || event.includes('stalled')) {
    console.warn(JSON.stringify(logEntry))
  } else {
    console.log(JSON.stringify(logEntry))
  }

  const span = tracer.scope().active()
  if (span) {
    span.log({ event, ...data })
  }
}

function emitLifecycleMetric(event: JobLifecycleEvent, queueName: string, jobName: string): void {
  const tags = [`queue_name:${queueName}`, `job_name:${jobName}`]
  tracer.dogstatsd.increment(`bullmq.lifecycle.${event.replace(':', '_')}`, 1, tags)
}

/**
 * Creates a QueueEvents listener that observes job lifecycle events.
 * Emits structured logs and metrics for each job state transition.
 */
export function createQueueEventsObserver(queueName: string): QueueEvents {
  const queueEvents = new QueueEvents(queueName, {
    connection: WORKER_CONNECTION_CONFIG,
    prefix: REDIS_KEY_PREFIX,
  })

  queueEvents.on('waiting', ({ jobId }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
    }
    emitLifecycleLog('job:waiting', data)
    emitLifecycleMetric('job:waiting', queueName, 'unknown')
  })

  queueEvents.on('active', ({ jobId }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
    }
    emitLifecycleLog('job:active', data)
    emitLifecycleMetric('job:active', queueName, 'unknown')
  })

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
      hasReturnValue: returnvalue !== undefined,
    }
    emitLifecycleLog('job:completed', data)
    emitLifecycleMetric('job:completed', queueName, 'unknown')
  })

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
      failedReason,
    }
    emitLifecycleLog('job:failed', data)
    emitLifecycleMetric('job:failed', queueName, 'unknown')
  })

  queueEvents.on('stalled', ({ jobId }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
    }
    emitLifecycleLog('job:stalled', data)
    emitLifecycleMetric('job:stalled', queueName, 'unknown')
  })

  queueEvents.on('progress', ({ jobId, data: progressData }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
      progress: progressData,
    }
    emitLifecycleLog('job:progress', data)
  })

  queueEvents.on('removed', ({ jobId }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
    }
    emitLifecycleLog('job:removed', data)
    emitLifecycleMetric('job:removed', queueName, 'unknown')
  })

  queueEvents.on('delayed', ({ jobId, delay }) => {
    const data: JobLifecycleEventData = {
      timestamp: new Date().toISOString(),
      queueName,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${queueName}-${Date.now()}`,
      delay,
    }
    emitLifecycleLog('job:delayed', data)
    emitLifecycleMetric('job:delayed', queueName, 'unknown')
  })

  return queueEvents
}

/**
 * Attaches worker-level lifecycle observers for concurrency and health monitoring.
 */
export function attachWorkerObserver(
  worker: Worker,
  maxConcurrency: number,
): void {
  let activeJobCount = 0

  worker.on('active', () => {
    activeJobCount++
    recordWorkerConcurrency(worker.name, activeJobCount, maxConcurrency)
  })

  worker.on('completed', () => {
    activeJobCount = Math.max(0, activeJobCount - 1)
    recordWorkerConcurrency(worker.name, activeJobCount, maxConcurrency)
  })

  worker.on('failed', () => {
    activeJobCount = Math.max(0, activeJobCount - 1)
    recordWorkerConcurrency(worker.name, activeJobCount, maxConcurrency)
  })

  worker.on('stalled', (jobId) => {
    emitLifecycleLog('job:stalled', {
      timestamp: new Date().toISOString(),
      queueName: worker.name,
      jobId,
      jobName: 'unknown',
      correlationId: jobId || `${worker.name}-${Date.now()}`,
      source: 'worker',
    })
  })
}

/**
 * Periodically records queue depth metrics.
 * Should be called with the queue instance to monitor.
 */
export async function recordQueueMetrics(
  queueName: string,
  getQueueCounts: () => Promise<{ waiting: number; active: number; delayed: number }>,
): Promise<void> {
  try {
    const counts = await getQueueCounts()
    const totalDepth = counts.waiting + counts.active + counts.delayed

    recordQueueDepth(queueName, totalDepth)

    const tags = [`queue_name:${queueName}`]
    tracer.dogstatsd.gauge('bullmq.queue.waiting', counts.waiting, tags)
    tracer.dogstatsd.gauge('bullmq.queue.active', counts.active, tags)
    tracer.dogstatsd.gauge('bullmq.queue.delayed', counts.delayed, tags)
  } catch (_error) {
    // Silently ignore metric collection errors to not disrupt worker operation
  }
}
