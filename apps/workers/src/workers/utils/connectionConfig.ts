import { env } from '@latitude-data/env'
import type { WorkerOptions } from 'bullmq'

export const WORKER_CONNECTION_CONFIG = {
  host: env.QUEUE_HOST,
  port: env.QUEUE_PORT,
  password: env.QUEUE_PASSWORD,
}

/**
 * Common connection configuration for BullMQ workers
 */
export const WORKER_OPTIONS: WorkerOptions = {
  connection: WORKER_CONNECTION_CONFIG,
}
