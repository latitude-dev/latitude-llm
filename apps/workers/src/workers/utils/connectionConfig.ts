import { env } from '@latitude-data/env'
import { WorkerOptions } from 'bullmq'

export const WORKER_CONNECTION_CONFIG = {
  host: env.QUEUE_HOST,
  port: env.QUEUE_PORT,
  password: env.QUEUE_PASSWORD,
}

/**
 * Lock duration for standard jobs (5 minutes).
 * Jobs must complete within this time or the lock will be auto-renewed.
 */
export const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000

/**
 * Lock duration for long-running jobs (15 minutes).
 * Long-running jobs (background runs, optimizations) should call job.extendLock()
 * periodically to prevent stall detection.
 */
export const LONG_RUNNING_LOCK_DURATION_MS = 15 * 60 * 1000

/**
 * Common connection configuration for BullMQ workers.
 * Uses 5-minute lock duration with stall detection every 60 seconds.
 */
export const WORKER_OPTIONS: WorkerOptions = {
  connection: WORKER_CONNECTION_CONFIG,
  lockDuration: DEFAULT_LOCK_DURATION_MS,
  stalledInterval: 60_000,
  maxStalledCount: 3,
}

/**
 * Worker options for long-running jobs (background runs, optimizations).
 * Uses 15-minute lock duration. Jobs running longer must call job.extendLock()
 * periodically to prevent being marked as stalled.
 */
export const LONG_RUNNING_WORKER_OPTIONS: WorkerOptions = {
  connection: WORKER_CONNECTION_CONFIG,
  lockDuration: LONG_RUNNING_LOCK_DURATION_MS,
  stalledInterval: 2 * 60_000,
  maxStalledCount: 2,
}
