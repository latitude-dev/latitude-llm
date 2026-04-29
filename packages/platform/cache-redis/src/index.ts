export { CacheStore, type CacheStoreShape } from "@domain/shared"
export { RedisCacheStoreLive } from "./ai-cache.ts"
export { EmbedBudgetResolverLive } from "./embed-budget-resolver.ts"
export { RedisIssueDiscoveryLockRepositoryLive } from "./issue-discovery-lock.ts"
export { TraceSearchBudgetLive } from "./trace-search-budget.ts"

import { ServiceMap } from "effect"

export class RedisCacheAdapterTag extends ServiceMap.Service<
  RedisCacheAdapterTag,
  {
    readonly type: "redis"
  }
>()("RedisCacheAdapterTag") {}

export const redisCacheAdapter = {
  type: "redis" as const,
}

export type { RedisClient } from "./client.ts"
export { buildRedisConnectionOptions, createRedisClient, waitForRedisClientReady } from "./client.ts"
export type { RedisConnection } from "./connection.ts"
export {
  createRedisConnection,
  createRedisConnectionEffect,
} from "./connection.ts"
export { checkRedisRateLimit, type RateLimitCheckInput, type RateLimitCheckResult } from "./rate-limiter.ts"
