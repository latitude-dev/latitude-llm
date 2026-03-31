import { CacheError, CacheStore } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { Redis } from "ioredis"

export const RedisCacheStoreLive = (redis: Redis) =>
  Layer.succeed(CacheStore, {
    get: (key) =>
      Effect.tryPromise({
        try: () => redis.get(key),
        catch: (cause) => new CacheError({ message: `Cache get failed: ${String(cause)}`, cause }),
      }),

    set: (key, value, options) =>
      Effect.tryPromise({
        try: async () => {
          if (options?.ttlSeconds !== undefined) {
            await redis.set(key, value, "EX", options.ttlSeconds)
            return
          }

          await redis.set(key, value)
        },
        catch: (cause) => new CacheError({ message: `Cache set failed: ${String(cause)}`, cause }),
      }),

    delete: (key) =>
      Effect.tryPromise({
        try: async () => {
          await redis.del(key)
        },
        catch: (cause) => new CacheError({ message: `Cache delete failed: ${String(cause)}`, cause }),
      }),
  })
