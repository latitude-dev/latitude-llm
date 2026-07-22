import { Effect } from "effect"
import type { TaxonomyFacetProjection } from "../entities/facet-projection.ts"
import type { FacetProjectionRepositoryShape } from "../ports/facet-projection-repository.ts"

/**
 * In-memory `taxonomy_facet_projections` fake with ReplacingMergeTree(indexed_at)
 * semantics: a re-upsert on the same `(facetId, sessionObservationId)` key keeps
 * the row with the greatest `indexedAt`, so writing an older row after a newer one
 * is a no-op (matching real ClickHouse, not insertion order).
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
        for (const projection of projections) {
          const rowKey = key(projection.facetId, projection.sessionObservationId)
          const existing = rows.get(rowKey)
          // ReplacingMergeTree(indexed_at): the greatest indexed_at wins, not the last write.
          if (!existing || projection.indexedAt >= existing.indexedAt) rows.set(rowKey, projection)
        }
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
