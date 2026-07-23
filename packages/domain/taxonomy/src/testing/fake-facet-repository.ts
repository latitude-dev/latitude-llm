import { type FacetId, NotFoundError, OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyFacet } from "../entities/facet.ts"
import type { FacetRepositoryShape } from "../ports/facet-repository.ts"

const FAKE_ORG_ID = OrganizationId("fake-org".padEnd(24, "0"))

/** In-memory repo for use-case tests; a slug collision on `save` fails like the Postgres unique index (23505). */
export const createFakeFacetRepository = (
  seed: readonly TaxonomyFacet[] = [],
  overrides?: Partial<FacetRepositoryShape>,
) => {
  const rows = new Map<FacetId, TaxonomyFacet>(seed.map((row) => [row.id, row] as const))
  // The scheduling column lives off the entity in Postgres; mirror that here so
  // tests can assert markGardened without widening TaxonomyFacet.
  const gardenedAt = new Map<FacetId, Date>()

  const collidesOnSlug = (projectId: string, slug: string, excludeId: string): boolean => {
    for (const row of rows.values()) {
      if (row.id === excludeId) continue
      if (row.projectId === projectId && row.slug === slug) return true
    }
    return false
  }

  const repository: FacetRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const row = rows.get(id)
        if (!row) return yield* new NotFoundError({ entity: "TaxonomyFacet", id })
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

    save: (facet) =>
      Effect.gen(function* () {
        if (collidesOnSlug(facet.projectId, facet.slug, facet.id)) {
          return yield* new RepositoryError({
            cause: new Error("duplicate slug"),
            operation: "FacetRepository.save",
          })
        }
        rows.set(facet.id, { ...facet, organizationId: FAKE_ORG_ID })
      }),

    markGardened: ({ id, gardenedAt: at }) => Effect.sync(() => void gardenedAt.set(id, at)),

    delete: (id) => Effect.sync(() => void rows.delete(id)),
    ...overrides,
  }

  return { repository, rows, gardenedAt }
}
