import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Showcase } from "../entities/showcase.ts"
import type { ShowcaseNotFoundError, ShowcaseNotReadyError } from "../errors.ts"

export interface ShowcaseRepositoryShape {
  find(): Effect.Effect<Showcase | null, RepositoryError, SqlClient>
  create(showcase: Showcase): Effect.Effect<Showcase, RepositoryError, SqlClient>

  /**
   * Start (or restart) a build: point `next` at a freshly-created project and
   * mark it `building`. Overwrites any prior in-flight `next` — a stale one
   * from a crashed build is reclaimed later (S5), never blocks a new run.
   * Leaves `current` untouched.
   */
  beginNextBuild(nextProjectId: ProjectId): Effect.Effect<Showcase, RepositoryError | ShowcaseNotFoundError, SqlClient>

  /** Quality gate passed: flip the in-flight `next` from `building` to `ready`. */
  markNextReady(): Effect.Effect<Showcase, RepositoryError | ShowcaseNotFoundError, SqlClient>

  /**
   * Self-heal a wedged build (S5). Under a row lock: if `next` is still
   * `building` and its pointer hasn't advanced since `staleBefore` (its Temporal
   * start failed, so no run is progressing it), reset the pointer to idle so the
   * next regeneration provisions a fresh `next` instead of resuming a dead one,
   * and return the reclaimed project id so the caller can retire it. A healthy
   * in-flight build (recent `updatedAt`) or a non-`building` pointer is left
   * untouched and returns `reclaimedProjectId: null`.
   */
  reclaimStaleBuild(
    staleBefore: Date,
  ): Effect.Effect<
    { readonly showcase: Showcase; readonly reclaimedProjectId: ProjectId | null },
    RepositoryError | ShowcaseNotFoundError,
    SqlClient
  >

  /**
   * Atomic blue/green swap, serialized by a row lock (`SELECT … FOR UPDATE`):
   * assert `next_state = 'ready'`, then set `current ← next`, clear `next`, and
   * reset `next_state` to idle — all in one transaction. Fails
   * `ShowcaseNotReadyError` if `next` isn't ready (also the race guard: only the
   * first of two concurrent swaps consumes the `ready` state). Returns the
   * post-swap pointer so the caller can invalidate caches / retire the old id.
   */
  swap(): Effect.Effect<Showcase, RepositoryError | ShowcaseNotFoundError | ShowcaseNotReadyError, SqlClient>
}

export class ShowcaseRepository extends Context.Service<ShowcaseRepository, ShowcaseRepositoryShape>()(
  "@domain/showcase/ShowcaseRepository",
) {}
