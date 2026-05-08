import type { RedisClient } from "@platform/cache-redis"
// `eq` is re-exported by `@platform/db-postgres` to keep all consumers on one
// drizzle-orm version (peer-dep collisions cause private-property typecheck
// errors otherwise).
import { eq, type PostgresClient } from "@platform/db-postgres"
import { oauthAccessTokens, oauthApplications } from "@platform/db-postgres/schema/better-auth"
import { hash } from "@repo/utils"
import { Effect } from "effect"

/**
 * Minimum time spent inside the validator before returning, in milliseconds.
 * Mirrors {@link `@platform/api-key-auth`.MIN_VALIDATION_TIME_MS}: matched on
 * purpose so the two auth paths look indistinguishable from a wall-clock
 * timing-attack perspective.
 */
export const MIN_VALIDATION_TIME_MS = 50

const VALID_TOKEN_TTL_SECONDS = 300
const INVALID_TOKEN_TTL_SECONDS = 5
const REDIS_OPERATION_TIMEOUT_MS = 50

const withTimeout = <T>(operation: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([
    operation,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), REDIS_OPERATION_TIMEOUT_MS)),
  ])

const getCacheKey = (tokenHash: string): string => `oauth:${tokenHash}`

/**
 * Result returned to the API auth middleware on a successful validation. The
 * middleware wraps this in its own `AuthContext` shape (with `method: "oauth"`)
 * before stashing it on the Hono context. Keeping the platform-level result
 * narrow lets future resource servers (ingest, etc.) use the same validator
 * without a circular dep on the API's auth-context type.
 */
export interface OAuthTokenAuthResult {
  readonly userId: string
  readonly organizationId: string
  readonly oauthClientId: string
  readonly scopes: ReadonlyArray<string>
  /** Token's `accessTokenExpiresAt`. Cached entries re-check this on hit. */
  readonly expiresAt: Date
}

/**
 * Wire shape used in Redis. {@link OAuthTokenAuthResult.expiresAt} is a `Date`
 * in memory but JSON-serialized as ISO 8601, so the cached form has to round-
 * trip through string before being rehydrated.
 */
interface CachedOAuthTokenAuthResult {
  readonly userId: string
  readonly organizationId: string
  readonly oauthClientId: string
  readonly scopes: ReadonlyArray<string>
  readonly expiresAt: string
}

const isCachedOAuthResult = (value: unknown): value is CachedOAuthTokenAuthResult | null => {
  if (value === null) return true
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.userId === "string" &&
    typeof v.organizationId === "string" &&
    typeof v.oauthClientId === "string" &&
    Array.isArray(v.scopes) &&
    v.scopes.every((s) => typeof s === "string") &&
    typeof v.expiresAt === "string"
  )
}

const getCached = (
  redis: RedisClient,
  tokenHash: string,
): Effect.Effect<OAuthTokenAuthResult | null | undefined, never> =>
  Effect.tryPromise({
    try: async () => {
      const raw = await withTimeout(redis.get(getCacheKey(tokenHash)), null)
      if (!raw) return undefined
      const parsed = JSON.parse(raw)
      if (!isCachedOAuthResult(parsed)) return undefined
      if (parsed === null) return null
      return {
        userId: parsed.userId,
        organizationId: parsed.organizationId,
        oauthClientId: parsed.oauthClientId,
        scopes: parsed.scopes,
        expiresAt: new Date(parsed.expiresAt),
      } satisfies OAuthTokenAuthResult
    },
    catch: () => undefined,
  }).pipe(Effect.orDie)

const cache = (
  redis: RedisClient,
  tokenHash: string,
  result: OAuthTokenAuthResult | null,
  ttl: number,
): Effect.Effect<void, never> => {
  const payload =
    result === null
      ? null
      : ({
          userId: result.userId,
          organizationId: result.organizationId,
          oauthClientId: result.oauthClientId,
          scopes: result.scopes,
          expiresAt: result.expiresAt.toISOString(),
        } satisfies CachedOAuthTokenAuthResult)
  return Effect.tryPromise({
    try: () => withTimeout(redis.setex(getCacheKey(tokenHash), ttl, JSON.stringify(payload)), undefined),
    catch: () => undefined,
  }).pipe(Effect.orDie)
}

const invalidateCache = (redis: RedisClient, tokenHash: string): Effect.Effect<void, never> =>
  Effect.tryPromise({
    try: () => withTimeout(redis.del(getCacheKey(tokenHash)) as Promise<unknown>, undefined),
    catch: () => undefined,
  }).pipe(Effect.orDie)

const enforceMinimumTime = (startTime: number, minMs: number): Effect.Effect<void, never> => {
  const elapsed = Date.now() - startTime
  if (elapsed < minMs) {
    return Effect.tryPromise({
      try: () => new Promise<void>((resolve) => setTimeout(resolve, minMs - elapsed)),
      catch: () => undefined,
    }).pipe(Effect.orDie)
  }
  return Effect.void
}

interface DbRow {
  readonly tokenRowId: string
  readonly userId: string | null
  readonly clientId: string | null
  readonly scopes: string | null
  readonly accessTokenExpiresAt: Date | null
  readonly applicationDisabled: boolean | null
  readonly organizationId: string | null
}

const lookupByToken = (client: PostgresClient, token: string): Promise<DbRow | undefined> =>
  client.db
    .select({
      tokenRowId: oauthAccessTokens.id,
      userId: oauthAccessTokens.userId,
      clientId: oauthAccessTokens.clientId,
      scopes: oauthAccessTokens.scopes,
      accessTokenExpiresAt: oauthAccessTokens.accessTokenExpiresAt,
      applicationDisabled: oauthApplications.disabled,
      organizationId: oauthApplications.organizationId,
    })
    .from(oauthAccessTokens)
    .innerJoin(oauthApplications, eq(oauthApplications.clientId, oauthAccessTokens.clientId))
    .where(eq(oauthAccessTokens.accessToken, token))
    .limit(1)
    .then((rows) => rows[0])

/**
 * Parse a BA-stored `scopes` text field (space-separated per RFC 6749 §3.3)
 * into a stable string array. NULL/empty produces an empty array.
 */
const parseScopes = (raw: string | null): ReadonlyArray<string> => {
  if (!raw) return []
  return raw.split(/\s+/).filter((s) => s.length > 0)
}

const isExpired = (expiresAt: Date, now: Date = new Date()): boolean => expiresAt.getTime() <= now.getTime()

const ttlFromExpiry = (expiresAt: Date, now: Date = new Date()): number => {
  const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
  return Math.max(1, Math.min(VALID_TOKEN_TTL_SECONDS, remainingSeconds))
}

export interface ValidateOAuthAccessTokenDeps {
  readonly redis: RedisClient
  readonly adminClient: PostgresClient
  /** Called when a token is validated via DB (not cache-only path). */
  readonly onTokenValidated?: (tokenRowId: string) => void
}

/**
 * Validate a Better-Auth-issued OAuth access token without going through BA's
 * own session API. Mirrors {@link `@platform/api-key-auth`.validateApiKey}'s
 * shape so the two auth paths look identical from the consumer's perspective:
 * Redis cache first (5 min TTL valid / 5 sec TTL invalid), admin Postgres
 * fallback on miss, minimum-timing pad to defend against timing attacks.
 *
 * Why we don't go through `auth.api.getMcpSession({ headers })`:
 *
 * 1. BA's `getMcpSession` does NOT check `accessTokenExpiresAt` (verified
 *    against `better-auth@1.6.9/dist/plugins/mcp/index.mjs`). An expired
 *    token would be accepted there but rejected here — going through BA
 *    would force us to re-implement the expiry check anyway.
 * 2. BA can't return our app-extension columns (`oauth_applications.disabled`,
 *    `oauth_applications.organization_id`). We need the org binding to
 *    populate the request's organization context, so the join is mandatory.
 *
 * Validation rules (any one rejects the token):
 *   - row not found
 *   - `accessTokenExpiresAt < now()`
 *   - `oauth_applications.disabled = true`
 *   - `oauth_applications.organization_id IS NULL` (registered but never
 *     consent-bound to an org — the `/auth/consent` step never happened or
 *     was abandoned)
 *
 * The DB query uses the admin Postgres connection (RLS-bypass) because
 * `oauth_applications` has RLS scoped by `organization_id` and the org id
 * is exactly what we're trying to discover from the token.
 *
 * Returns `null` for all rejection cases (matches `validateApiKey` shape);
 * the API auth middleware turns null into a 401 with a `WWW-Authenticate`
 * header pointing at the protected-resource discovery endpoint.
 */
export const validateOAuthAccessToken = (
  token: string,
  deps: ValidateOAuthAccessTokenDeps,
): Effect.Effect<OAuthTokenAuthResult | null, never> => {
  const { redis, adminClient, onTokenValidated } = deps

  return Effect.gen(function* () {
    const startTime = Date.now()
    // Hash for the Redis key only — the DB stores the raw access_token (BA's
    // schema). We don't put raw bearer tokens in Redis as defense in depth.
    const tokenHash = yield* hash(token)

    const cached = yield* getCached(redis, tokenHash)

    if (cached !== undefined) {
      // Belt-and-suspenders: even though the cache TTL is bounded by token
      // expiry, double-check on hit so a token expiring in the cache window
      // doesn't keep working.
      if (cached !== null && isExpired(cached.expiresAt)) {
        yield* invalidateCache(redis, tokenHash)
        // Fall through to the DB path so we don't return stale-expired.
      } else {
        yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
        return cached
      }
    }

    const row = yield* Effect.tryPromise({
      try: () => lookupByToken(adminClient, token),
      catch: () => undefined,
    }).pipe(Effect.orDie)

    if (
      !row ||
      row.userId === null ||
      row.clientId === null ||
      row.accessTokenExpiresAt === null ||
      isExpired(row.accessTokenExpiresAt) ||
      row.applicationDisabled === true ||
      row.organizationId === null
    ) {
      yield* cache(redis, tokenHash, null, INVALID_TOKEN_TTL_SECONDS)
      yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
      return null
    }

    const result: OAuthTokenAuthResult = {
      userId: row.userId,
      organizationId: row.organizationId,
      oauthClientId: row.clientId,
      scopes: parseScopes(row.scopes),
      expiresAt: row.accessTokenExpiresAt,
    }

    yield* cache(redis, tokenHash, result, ttlFromExpiry(row.accessTokenExpiresAt))
    onTokenValidated?.(row.tokenRowId)
    yield* enforceMinimumTime(startTime, MIN_VALIDATION_TIME_MS)
    return result
  }).pipe(Effect.orDie)
}
