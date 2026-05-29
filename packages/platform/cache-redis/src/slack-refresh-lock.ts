import { randomUUID } from "node:crypto"
import { SlackRefreshLockRepository, SlackRefreshLockUnavailableError } from "@domain/integrations"
import { CacheError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { RedisClient } from "./client.ts"

const releaseLockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

const lockKey = (organizationId: string) => `org:${organizationId}:slack:refresh`

/**
 * Per-workspace single-flight lock for Slack token rotation. Mirrors
 * `RedisTaxonomyLockRepositoryLive` / `RedisIssueDiscoveryLockRepositoryLive`:
 * `SET NX EX` with a unique token, released via a token-comparison Lua
 * delete (best-effort — the TTL reclaims if release fails). Serializes
 * the on-use refresh paths (web channel listing + notification worker)
 * and the scheduled sweep so the single-use refresh token is never
 * rotated twice concurrently.
 */
export const RedisSlackRefreshLockRepositoryLive = (redis: RedisClient) =>
  Layer.succeed(SlackRefreshLockRepository, {
    withRefreshLock: (input, effect) =>
      Effect.gen(function* () {
        const key = lockKey(input.organizationId)
        const lockToken = randomUUID()

        const acquired = yield* Effect.tryPromise({
          try: () => redis.set(key, lockToken, "EX", input.ttlSeconds, "NX"),
          catch: (cause) => new CacheError({ message: `Slack refresh lock acquire failed: ${String(cause)}`, cause }),
        })

        if (acquired !== "OK") {
          return yield* Effect.fail(new SlackRefreshLockUnavailableError({ organizationId: input.organizationId }))
        }

        return yield* effect.pipe(
          Effect.ensuring(
            Effect.tryPromise({
              try: () => redis.eval(releaseLockScript, 1, key, lockToken),
              catch: (cause) =>
                new CacheError({ message: `Slack refresh lock release failed: ${String(cause)}`, cause }),
            }).pipe(
              // Release failure is non-fatal (TTL reclaims) but worth a log.
              Effect.tapError((error) => Effect.logWarning("Slack refresh lock release failed", { key, error })),
              Effect.ignore,
            ),
          ),
        )
      }),
  })
