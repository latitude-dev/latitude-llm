import { Queue } from "bullmq"
import type { BullMqConfig } from "./config.ts"
import { createBullMqRedisConnection } from "./connection.ts"

/**
 * Creates read-only BullMQ Queue instances for bull-board to inspect.
 * These queues share a single Redis connection and are not used for publishing or consuming.
 */
export function createBullBoardQueues(config: BullMqConfig, topicNames: readonly string[]): Queue[] {
  const connection = createBullMqRedisConnection(config)

  return topicNames.map((name) => new Queue(name, { connection, prefix: "{bull}" }))
}
