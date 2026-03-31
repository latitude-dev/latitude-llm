import { AICache, AIError } from "@domain/ai"
import { Effect, Layer } from "effect"
import type { Redis } from "ioredis"

const DEFAULT_TTL_SECONDS = 24 * 60 * 60 // 1 day

export const AICacheLive = (redis: Redis, ttlSeconds: number = DEFAULT_TTL_SECONDS) =>
  Layer.succeed(AICache, {
    get: (key) =>
      Effect.tryPromise({
        try: () => redis.get(key),
        catch: (cause) => new AIError({ message: `AICache get failed: ${cause}`, cause }),
      }),

    set: (key, value) =>
      Effect.tryPromise({
        try: async () => {
          await redis.set(key, value, "EX", ttlSeconds)
        },
        catch: (cause) => new AIError({ message: `AICache set failed: ${cause}`, cause }),
      }),
  })
