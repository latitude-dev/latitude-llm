import {
  CacheStore,
  type OrganizationId,
  type OrganizationRedactionSetting,
  organizationRedactionSettingSchema,
  SettingsReader,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"

const REDACTION_SETTING_CACHE_TTL_SECONDS = 60

const buildCacheKey = (organizationId: string) => `org:${organizationId}:settings:redaction`

/**
 * The setting is wrapped rather than cached bare so a cached "this org has no
 * redaction policy" is distinguishable from a cache miss. Almost every org is in
 * that state, and it is the case the cache exists to serve.
 */
const cachedRedactionSchema = z.object({
  redaction: organizationRedactionSettingSchema.nullable(),
})

const parseCached = (json: string): OrganizationRedactionSetting | null | undefined => {
  try {
    const result = cachedRedactionSchema.safeParse(JSON.parse(json))

    return result.success ? result.data.redaction : undefined
  } catch {
    return undefined
  }
}

/**
 * Organization-level redaction setting, cached for 60 s.
 *
 * Read on the OTLP ingest path, which is the hottest path in the product, so the
 * uncached `SettingsReader` query it wraps must not run per request. The project
 * half of the cascade needs no cache: `ingestSpansUseCase` already holds each
 * resolved `Project` with its settings.
 *
 * A read failure propagates rather than degrading to "no org policy". Degrading
 * would let a `locked` org policy silently fall back to a weaker project policy
 * and write plaintext, and it buys no availability: project resolution on this
 * path already hard-depends on Postgres, so the request fails anyway.
 *
 * Consequence to document for users: enabling or locking redaction takes effect
 * within 60 s, not instantly.
 */
export const resolveOrganizationRedactionCached = Effect.fn("spans.resolveOrganizationRedactionCached")(function* (
  organizationId: OrganizationId,
) {
  const cache = yield* CacheStore
  const cacheKey = buildCacheKey(organizationId)

  const cachedJson = yield* cache.get(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
  if (cachedJson !== null) {
    const parsed = parseCached(cachedJson)
    if (parsed !== undefined) {
      yield* Effect.annotateCurrentSpan("cache.hit", true)
      return parsed
    }
  }

  yield* Effect.annotateCurrentSpan("cache.hit", false)
  const reader = yield* SettingsReader
  const settings = yield* reader.getOrganizationSettings()
  const redaction = settings?.redaction ?? null

  yield* cache
    .set(cacheKey, JSON.stringify({ redaction }), { ttlSeconds: REDACTION_SETTING_CACHE_TTL_SECONDS })
    .pipe(Effect.catchTag("CacheError", () => Effect.void))

  return redaction
})

export const invalidateOrganizationRedactionCache = Effect.fn("spans.invalidateOrganizationRedactionCache")(function* (
  organizationId: OrganizationId,
) {
  const cache = yield* CacheStore

  yield* cache.delete(buildCacheKey(organizationId)).pipe(Effect.catchTag("CacheError", () => Effect.void))
})
