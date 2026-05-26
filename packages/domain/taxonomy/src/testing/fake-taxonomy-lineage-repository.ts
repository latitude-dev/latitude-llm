import { Effect } from "effect"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import type { TaxonomyLineageRepositoryShape } from "../ports/taxonomy-lineage-repository.ts"

export const createFakeTaxonomyLineageRepository = (
  seed: readonly TaxonomyClusterLineage[] = [],
  overrides?: Partial<TaxonomyLineageRepositoryShape>,
) => {
  const rows: TaxonomyClusterLineage[] = [...seed]

  const repository: TaxonomyLineageRepositoryShape = {
    appendMany: (newRows) =>
      Effect.sync(() => {
        rows.push(...newRows)
      }),

    listRecent: ({ projectId, limit }) =>
      Effect.sync(() =>
        rows
          .filter((row) => row.projectId === projectId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit),
      ),

    listRecentByTransitionTypes: ({ projectId, transitionTypes, limit }) =>
      Effect.sync(() =>
        rows
          .filter((row) => row.projectId === projectId && transitionTypes.includes(row.transitionType))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit),
      ),

    ...overrides,
  }

  return { repository, rows }
}
