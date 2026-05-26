import { randomUUID } from "node:crypto"
import { CacheError } from "@domain/shared"
import {
  TaxonomyClusterLockUnavailableError,
  TaxonomyGardenLockUnavailableError,
  TaxonomyLockRepository,
} from "@domain/taxonomy"
import { Effect, Layer } from "effect"
import type { RedisClient } from "./client.ts"

const releaseLockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

const clusterLockKey = (input: { readonly organizationId: string; readonly clusterId: string }) =>
  `org:${input.organizationId}:taxonomy:cluster:${input.clusterId}`

const gardenLockKey = (input: { readonly organizationId: string; readonly projectId: string }) =>
  `org:${input.organizationId}:taxonomy:garden:${input.projectId}`

const withRedisLock = <A, E, R, EUnavailable>(input: {
  readonly redis: RedisClient
  readonly key: string
  readonly ttlSeconds: number
  readonly unavailable: Effect.Effect<never, EUnavailable, never>
  readonly acquireErrorMessage: string
  readonly releaseErrorMessage: string
  readonly effect: Effect.Effect<A, E, R>
}): Effect.Effect<A, E | EUnavailable | CacheError, R> =>
  Effect.gen(function* () {
    const lockToken = randomUUID()

    const acquired = yield* Effect.tryPromise({
      try: () => input.redis.set(input.key, lockToken, "EX", input.ttlSeconds, "NX"),
      catch: (cause) => new CacheError({ message: `${input.acquireErrorMessage}: ${String(cause)}`, cause }),
    })

    if (acquired !== "OK") {
      return yield* input.unavailable
    }

    return yield* input.effect.pipe(
      Effect.ensuring(
        Effect.tryPromise({
          try: () => input.redis.eval(releaseLockScript, 1, input.key, lockToken),
          catch: (cause) => new CacheError({ message: `${input.releaseErrorMessage}: ${String(cause)}`, cause }),
        }).pipe(
          // Release failure is non-fatal — the TTL will reclaim the lock — but
          // silently swallowing it hides Redis health issues. Log + ignore.
          Effect.tapError((error) => Effect.logWarning(input.releaseErrorMessage, { key: input.key, error })),
          Effect.ignore,
        ),
      ),
    )
  })

export const RedisTaxonomyLockRepositoryLive = (redis: RedisClient) =>
  Layer.succeed(TaxonomyLockRepository, {
    withClusterLock: (input, effect) =>
      withRedisLock({
        redis,
        key: clusterLockKey(input),
        ttlSeconds: input.ttlSeconds,
        unavailable: Effect.fail(new TaxonomyClusterLockUnavailableError({ clusterId: input.clusterId })),
        acquireErrorMessage: "Taxonomy cluster lock acquire failed",
        releaseErrorMessage: "Taxonomy cluster lock release failed",
        effect,
      }),

    withGardenLock: (input, effect) =>
      withRedisLock({
        redis,
        key: gardenLockKey(input),
        ttlSeconds: input.ttlSeconds,
        unavailable: Effect.fail(new TaxonomyGardenLockUnavailableError({ projectId: input.projectId })),
        acquireErrorMessage: "Taxonomy garden lock acquire failed",
        releaseErrorMessage: "Taxonomy garden lock release failed",
        effect,
      }),
  })
