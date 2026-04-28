import { randomUUID } from "node:crypto"
import { IssueDiscoveryLockRepository, IssueDiscoveryLockUnavailableError } from "@domain/issues"
import { CacheError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { RedisClient } from "./client.ts"

const releaseLockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

const buildLockKey = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly lockKey: string
}) => `org:${input.organizationId}:issues:discovery:${input.projectId}:${input.lockKey}`

export const RedisIssueDiscoveryLockRepositoryLive = (redis: RedisClient) =>
  Layer.succeed(IssueDiscoveryLockRepository, {
    withLock: (input, effect) =>
      Effect.gen(function* () {
        const lockKey = buildLockKey(input)
        const lockToken = randomUUID()

        const acquired = yield* Effect.tryPromise({
          try: () => redis.set(lockKey, lockToken, "PX", input.ttlMs, "NX"),
          catch: (cause) => new CacheError({ message: `Issue discovery lock acquire failed: ${String(cause)}`, cause }),
        })

        if (acquired !== "OK") {
          return yield* Effect.fail(
            new IssueDiscoveryLockUnavailableError({
              projectId: input.projectId,
              lockKey: input.lockKey,
            }),
          )
        }

        return yield* effect.pipe(
          Effect.ensuring(
            Effect.tryPromise({
              try: () => redis.eval(releaseLockScript, 1, lockKey, lockToken),
              catch: (cause) =>
                new CacheError({ message: `Issue discovery lock release failed: ${String(cause)}`, cause }),
            }).pipe(Effect.ignore),
          ),
        )
      }),
  })
