import { CacheStore, type RepositoryError, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SHOWCASE_CURRENT_CACHE_KEY, type Showcase } from "../entities/showcase.ts"
import type { ShowcaseNotFoundError, ShowcaseNotReadyError } from "../errors.ts"
import { ShowcaseRepository } from "../ports/showcase-repository.ts"

export type SwapShowcaseError = ShowcaseNotFoundError | ShowcaseNotReadyError | RepositoryError

/**
 * The blue/green pointer flip — S4 owns this. Delegates the atomic, row-locked
 * `assert next_state = 'ready' → current ← next → reset` to the repository
 * (one transaction) so a manual backoffice swap and the scheduled swap can't
 * collide, then invalidates the Redis cache so the next resolver read rebuilds
 * from the pointer.
 *
 * Cache invalidation is best-effort: the DB swap has already committed by then,
 * so a Redis blip must not fail the swap (and can't roll it back). The resolver
 * cache carries a TTL, so a missed invalidation self-heals.
 */
export const swapShowcaseUseCase = Effect.fn("showcase.swap")(function* () {
  const showcaseRepo = yield* ShowcaseRepository
  const swapped = yield* showcaseRepo.swap()

  const cache = yield* CacheStore
  yield* cache
    .delete(SHOWCASE_CURRENT_CACHE_KEY)
    .pipe(Effect.catch((error) => Effect.logWarning("showcase cache invalidation failed after swap", error)))

  return swapped
}) satisfies () => Effect.Effect<Showcase, SwapShowcaseError, ShowcaseRepository | SqlClient | CacheStore>
