import { buildRedisConnectionOptions } from "@platform/cache-redis"
import { Queue } from "bullmq"
import { Redis } from "ioredis"
import type { BullMqConfig } from "./config.ts"

/**
 * Creates read-only BullMQ Queue instances for bull-board to inspect.
 * These queues share a single Redis connection and are not used for publishing or consuming.
 */
export function createBullBoardQueues(config: BullMqConfig, topicNames: readonly string[]): Queue[] {
  const connection = new Redis({
    ...buildRedisConnectionOptions(config),
    maxRetriesPerRequest: null,
  })

  return topicNames.map((name) => new Queue(name, { connection, prefix: "{bull}" }))
}
