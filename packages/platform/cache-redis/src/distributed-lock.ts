import { randomUUID } from "node:crypto"
import { CacheError, DistributedLockRepository, DistributedLockUnavailableError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { RedisClient } from "./client.ts"

const releaseLockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

export const RedisDistributedLockRepositoryLive = (redis: RedisClient) =>
  Layer.succeed(DistributedLockRepository, {
    withLock: (input, effect) =>
      Effect.gen(function* () {
        const lockToken = randomUUID()

        const acquired = yield* Effect.tryPromise({
          try: () => redis.set(input.key, lockToken, "EX", input.ttlSeconds, "NX"),
          catch: (cause) => new CacheError({ message: `Distributed lock acquire failed: ${String(cause)}`, cause }),
        })

        if (acquired !== "OK") {
          return yield* Effect.fail(new DistributedLockUnavailableError({ key: input.key }))
        }

        return yield* effect.pipe(
          Effect.ensuring(
            Effect.tryPromise({
              try: () => redis.eval(releaseLockScript, 1, input.key, lockToken),
              catch: (cause) => new CacheError({ message: `Distributed lock release failed: ${String(cause)}`, cause }),
            }).pipe(
              Effect.tapError((error) =>
                Effect.logWarning("Distributed lock release failed", { key: input.key, error }),
              ),
              Effect.ignore,
            ),
          ),
        )
      }),
  })
