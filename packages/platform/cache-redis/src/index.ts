export { CacheStore, type CacheStoreShape } from "@domain/shared"
export { RedisCacheStoreLive } from "./ai-cache.ts"

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
export { createRedisClient } from "./client.ts"
export type { RedisConnection } from "./connection.ts"
export {
  createRedisConnection,
  createRedisConnectionEffect,
} from "./connection.ts"
