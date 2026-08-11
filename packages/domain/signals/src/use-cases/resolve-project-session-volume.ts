import { CacheStore, type FilterCondition, type OrganizationId, type ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import {
  PROJECT_SESSION_VOLUME_CACHE_KEY,
  PROJECT_SESSION_VOLUME_CACHE_TTL_SECONDS,
  PROMOTION_WINDOW_DAYS,
} from "../constants.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

interface ResolveProjectSessionVolumeInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly now?: Date
}

// Only the canonical form this use case writes is trusted: `parseInt` would read
// "6e3" as 6 and "3000.9" as 3000, and either silently lowers the threshold.
const parseCachedVolume = (raw: string): number | null => {
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 0 && String(parsed) === raw ? parsed : null
}

/**
 * Sessions the project saw over the promotion window, used to scale the
 * promotion threshold.
 *
 * Read-through cache: the count is a ClickHouse scan, and the promotion path
 * runs per assigned score, so it is resolved once per TTL rather than per
 * decision. Returns `null` when the volume cannot be established (cache and
 * ClickHouse both fail) — callers treat that as "fall back to the floor", so a
 * broken lookup can only make promotion easier, never suppress a signal.
 *
 * Counted against `sessions.start_time`, matching how the Signals list counts
 * the same denominator, so the threshold and the displayed affected-session
 * percentage cannot disagree about what a session in the window is.
 */
export const resolveProjectSessionVolumeUseCase = Effect.fn("signals.resolveProjectSessionVolume")(function* (
  input: ResolveProjectSessionVolumeInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const cache = yield* CacheStore
  const cacheKey = PROJECT_SESSION_VOLUME_CACHE_KEY(input.organizationId, input.projectId)

  const cached = yield* cache.get(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
  if (cached !== null) {
    const parsed = parseCachedVolume(cached)
    if (parsed !== null) return parsed
  }

  const now = input.now ?? new Date()
  const windowStart = new Date(now.getTime() - PROMOTION_WINDOW_DAYS * MILLISECONDS_PER_DAY)
  const startTime: FilterCondition[] = [{ op: "gte", value: windowStart.toISOString() }]

  const sessionRepository = yield* SessionRepository
  const count = yield* sessionRepository
    .countByProjectId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      filters: { startTime },
    })
    .pipe(
      Effect.map((result) => result.totalCount),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )

  if (count === null) {
    yield* Effect.annotateCurrentSpan("volume.degraded", true)
    return null
  }

  yield* cache
    .set(cacheKey, String(count), { ttlSeconds: PROJECT_SESSION_VOLUME_CACHE_TTL_SECONDS })
    .pipe(Effect.catchTag("CacheError", () => Effect.void))

  return count
})
