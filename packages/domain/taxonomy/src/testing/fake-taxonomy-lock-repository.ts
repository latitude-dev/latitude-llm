import { Effect } from "effect"
import type { TaxonomyLockRepositoryShape } from "../ports/taxonomy-lock-repository.ts"

/**
 * Sequential in-memory lock. Tests that exercise contention seed
 * `heldClusters` / `heldGardens` via the returned setters; otherwise
 * locks always acquire successfully and run the inner effect.
 */
export const createFakeTaxonomyLockRepository = (overrides?: Partial<TaxonomyLockRepositoryShape>) => {
  const heldClusters = new Set<string>()
  const heldGardens = new Set<string>()

  const repository: TaxonomyLockRepositoryShape = {
    withClusterLock: <A, E, R>({ clusterId }: { readonly clusterId: string }, effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        if (heldClusters.has(clusterId)) {
          return yield* Effect.fail(new Error(`cluster ${clusterId} held`) as never)
        }
        heldClusters.add(clusterId)
        try {
          return yield* effect
        } finally {
          heldClusters.delete(clusterId)
        }
      }) as Effect.Effect<A, E, R>,

    withGardenLock: <A, E, R>({ projectId }: { readonly projectId: string }, effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        if (heldGardens.has(projectId)) {
          return yield* Effect.fail(new Error(`garden ${projectId} held`) as never)
        }
        heldGardens.add(projectId)
        try {
          return yield* effect
        } finally {
          heldGardens.delete(projectId)
        }
      }) as Effect.Effect<A, E, R>,

    ...overrides,
  }

  return { repository, heldClusters, heldGardens }
}
