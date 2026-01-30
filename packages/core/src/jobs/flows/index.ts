import { env } from '@latitude-data/env'
import { FlowProducer } from 'bullmq'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../../redis'

export * from './types'
export * from './sequential'
export * from './enqueue'
export * from './dynamicChildren'

let _flowProducer: FlowProducer | undefined

/**
 * Returns a singleton FlowProducer instance for creating job flows.
 * Uses the same Redis connection configuration as the queues.
 */
export async function flowProducer(): Promise<FlowProducer> {
  if (_flowProducer) return _flowProducer

  _flowProducer = new FlowProducer({
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
    }),
  })

  return _flowProducer
}
