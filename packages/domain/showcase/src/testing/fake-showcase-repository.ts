import { type ProjectId, type RepositoryError, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Showcase } from "../entities/showcase.ts"
import { ShowcaseNotFoundError, ShowcaseNotReadyError } from "../errors.ts"
import type { ShowcaseRepositoryShape } from "../ports/showcase-repository.ts"

/**
 * In-memory `ShowcaseRepository`. `create` mirrors the DB `id = 1` PK guard by
 * rejecting a second insert with a `RepositoryError`, so tests can exercise the
 * race-proof backstop as well as the explicit `find` check.
 *
 * `swap` mirrors the live adapter's row-locked assert-then-flip: it reads the
 * current row, requires `next_state = 'ready'`, and flips atomically. Because
 * Effects run to completion before the next observes the store, a second swap
 * always sees the post-swap `idle` state and fails `ShowcaseNotReadyError` —
 * the same serialization the `FOR UPDATE` lock enforces under real concurrency.
 */
export const createFakeShowcaseRepository = (initial?: Showcase | null) => {
  const store: { current: Showcase | null } = { current: initial ?? null }

  const repository: ShowcaseRepositoryShape = {
    find: () => Effect.succeed(store.current),

    create: (showcase) =>
      Effect.gen(function* () {
        if (store.current) {
          return yield* Effect.fail<RepositoryError>(
            toRepositoryError(new Error("duplicate key value violates unique constraint (id = 1)"), "insert"),
          )
        }
        store.current = showcase
        return showcase
      }),

    beginNextBuild: (nextProjectId: ProjectId) =>
      Effect.gen(function* () {
        if (!store.current) return yield* Effect.fail(new ShowcaseNotFoundError())
        store.current = { ...store.current, nextProjectId, nextState: "building", updatedAt: new Date() }
        return store.current
      }),

    markNextReady: () =>
      Effect.gen(function* () {
        if (!store.current || !store.current.nextProjectId) return yield* Effect.fail(new ShowcaseNotFoundError())
        store.current = { ...store.current, nextState: "ready", updatedAt: new Date() }
        return store.current
      }),

    reclaimStaleBuild: (staleBefore: Date) =>
      Effect.gen(function* () {
        const row = store.current
        if (!row) return yield* Effect.fail(new ShowcaseNotFoundError())
        if (row.nextState === "building" && row.nextProjectId && row.updatedAt < staleBefore) {
          const reclaimedProjectId = row.nextProjectId
          store.current = { ...row, nextProjectId: null, nextState: null, updatedAt: new Date() }
          return { showcase: store.current, reclaimedProjectId }
        }
        return { showcase: row, reclaimedProjectId: null }
      }),

    swap: () =>
      Effect.gen(function* () {
        const row = store.current
        if (!row) return yield* Effect.fail(new ShowcaseNotFoundError())
        if (row.nextState !== "ready" || !row.nextProjectId) {
          return yield* Effect.fail(new ShowcaseNotReadyError({ nextState: row.nextState }))
        }
        store.current = {
          ...row,
          currentProjectId: row.nextProjectId,
          nextProjectId: null,
          nextState: null,
          updatedAt: new Date(),
        }
        return store.current
      }),
  }

  return { repository, store }
}
