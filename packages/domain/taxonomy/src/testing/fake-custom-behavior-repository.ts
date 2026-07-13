import { type CustomBehaviorId, NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { CustomBehavior } from "../entities/custom-behavior.ts"
import type { CustomBehaviorRepositoryShape } from "../ports/custom-behavior-repository.ts"

const FAKE_ORG_ID = OrganizationId("fake-org".padEnd(24, "0"))

/**
 * In-memory {@link CustomBehaviorRepositoryShape} for use-case unit tests. It
 * enforces the same project+slug uniqueness the Postgres unique index does, so
 * a `save` that collides on slug fails with a `RepositoryError` (mirroring a
 * 23505). Org scoping is a live-repo/RLS concern and is exercised in the
 * platform testkit tests, not here.
 */
export const createFakeCustomBehaviorRepository = (
  seed: readonly CustomBehavior[] = [],
  overrides?: Partial<CustomBehaviorRepositoryShape>,
) => {
  const rows = new Map<CustomBehaviorId, CustomBehavior>(seed.map((row) => [row.id, row] as const))

  const collidesOnSlug = (projectId: string, slug: string, excludeId: string): boolean => {
    for (const row of rows.values()) {
      if (row.id === excludeId) continue
      if (row.projectId === projectId && row.slug === slug) return true
    }
    return false
  }

  const repository: CustomBehaviorRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const row = rows.get(id)
        if (!row) return yield* new NotFoundError({ entity: "CustomBehavior", id })
        return row
      }),

    findBySlug: ({ projectId, slug }) =>
      Effect.sync(() => {
        for (const row of rows.values()) {
          if (row.projectId === projectId && row.slug === slug) return row
        }
        return null
      }),

    listByProject: ({ projectId }) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((row) => row.projectId === projectId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),

    countByProject: ({ projectId }) =>
      Effect.sync(() => [...rows.values()].filter((row) => row.projectId === projectId).length),

    countBySlug: ({ projectId, slug }) =>
      Effect.sync(() => [...rows.values()].filter((row) => row.projectId === projectId && row.slug === slug).length),

    save: (behavior) =>
      Effect.gen(function* () {
        if (collidesOnSlug(behavior.projectId, behavior.slug, behavior.id)) {
          return yield* new RepositoryError({
            cause: new Error("duplicate slug"),
            operation: "CustomBehaviorRepository.save",
          })
        }
        rows.set(behavior.id, { ...behavior, organizationId: FAKE_ORG_ID })
      }),

    delete: (id) => Effect.sync(() => void rows.delete(id)),
    ...overrides,
  }

  return { repository, rows }
}
