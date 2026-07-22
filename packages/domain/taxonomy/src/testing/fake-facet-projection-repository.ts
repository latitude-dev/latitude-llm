import { Effect } from "effect"
import type { TaxonomyFacetProjection } from "../entities/facet-projection.ts"
import type { FacetProjectionRepositoryShape } from "../ports/facet-projection-repository.ts"

/**
 * In-memory `taxonomy_facet_projections` fake with ReplacingMergeTree semantics:
 * a re-upsert on the same `(facetId, sessionObservationId)` key replaces the prior row.
 */
export const createFakeFacetProjectionRepository = (
  seed: readonly TaxonomyFacetProjection[] = [],
  overrides?: Partial<FacetProjectionRepositoryShape>,
) => {
  const key = (facetId: string, sessionObservationId: string) => `${facetId}::${sessionObservationId}`
  const rows = new Map<string, TaxonomyFacetProjection>(
    seed.map((row) => [key(row.facetId, row.sessionObservationId), row] as const),
  )

  const repository: FacetProjectionRepositoryShape = {
    upsertMany: (projections) =>
      Effect.sync(() => {
        for (const projection of projections)
          rows.set(key(projection.facetId, projection.sessionObservationId), projection)
      }),

    listBySessionObservationIds: ({ facetId, sessionObservationIds }) =>
      Effect.sync(() => {
        const wanted = new Set(sessionObservationIds)
        return [...rows.values()].filter((row) => row.facetId === facetId && wanted.has(row.sessionObservationId))
      }),

    deleteByFacet: ({ facetId }) =>
      Effect.sync(() => {
        for (const [rowKey, row] of rows) if (row.facetId === facetId) rows.delete(rowKey)
      }),

    ...overrides,
  }

  return { repository, rows }
}
