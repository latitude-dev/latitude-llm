import { type RepositoryError, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Showcase } from "../entities/showcase.ts"
import type { ShowcaseRepositoryShape } from "../ports/showcase-repository.ts"

/**
 * In-memory `ShowcaseRepository`. `create` mirrors the DB `id = 1` PK guard by
 * rejecting a second insert with a `RepositoryError`, so tests can exercise the
 * race-proof backstop as well as the explicit `find` check.
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
  }

  return { repository, store }
}
