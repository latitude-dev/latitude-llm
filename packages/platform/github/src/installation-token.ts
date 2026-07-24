import { Effect } from "effect"
import { mintInstallationToken } from "./client.ts"
import type { GithubConfig } from "./config.ts"
import type { GithubApiError } from "./errors.ts"

const INSTALLATION_TOKEN_TTL_SECONDS = 55 * 60

/** Minimal Redis surface: production passes ioredis, tests an in-memory fake. */
export interface GithubTokenCacheRedis {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>
}

export const buildInstallationTokenCacheKey = (input: {
  readonly organizationId: string
  readonly installationId: number
}): string => `org:${input.organizationId}:github:installation-token:${input.installationId}`

/**
 * Returns an installation access token, minting and caching it in Redis (TTL
 * 55m, under the 60m GitHub lifetime) on a miss. Nothing GitHub-issued is
 * persisted in Postgres — installation tokens live only in Redis (5.1).
 */
export const getInstallationToken = (input: {
  readonly config: GithubConfig
  readonly installationId: number
  readonly organizationId: string
  readonly redis: GithubTokenCacheRedis
}): Effect.Effect<string, GithubApiError> =>
  Effect.gen(function* () {
    const cacheKey = buildInstallationTokenCacheKey({
      organizationId: input.organizationId,
      installationId: input.installationId,
    })

    const cached = yield* Effect.promise(() => input.redis.get(cacheKey).catch(() => null))
    if (cached) return cached

    const { token } = yield* mintInstallationToken({ config: input.config, installationId: input.installationId })
    yield* Effect.promise(() =>
      input.redis.set(cacheKey, token, "EX", INSTALLATION_TOKEN_TTL_SECONDS).catch(() => undefined),
    )
    return token
  })
