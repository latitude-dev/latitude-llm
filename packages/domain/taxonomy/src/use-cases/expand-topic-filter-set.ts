import { type FilterSet, type ProjectId, type RepositoryError, type SqlClient, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

// A selection that expands to nothing (e.g. a persisted filter pointing at a
// since-merged cluster) must match ZERO sessions — an empty in-list would
// collapse to "no filter" downstream and silently show the whole project.
const NO_MATCH_CLUSTER_ID = "__no_matching_topic__"

/**
 * Selecting a topic means its whole subtree: tree nodes hold residue
 * observations directly while descendants hold the rest, so the `topics` filter
 * expands each selected node into its subtree ids before ClickHouse sees it.
 * Returns the filter set unchanged when it carries no `topics` `in` condition.
 */
export const expandTopicFilterSetUseCase = (input: {
  readonly projectId: ProjectId
  readonly filters: FilterSet | undefined
}): Effect.Effect<FilterSet | undefined, RepositoryError, TaxonomyClusterRepository | SqlClient> =>
  Effect.gen(function* () {
    const { filters } = input
    const inCondition = filters?.topics?.find((condition) => condition.op === "in")
    const selected = Array.isArray(inCondition?.value) ? inCondition.value.map(String) : []
    if (!filters || selected.length === 0) return filters

    const clusters = yield* TaxonomyClusterRepository
    const ids = new Set<string>()
    for (const id of selected) {
      const subtree = yield* clusters.listSubtreeIds({ projectId: input.projectId, clusterId: TaxonomyClusterId(id) })
      for (const subtreeId of subtree) ids.add(subtreeId as string)
    }
    const expanded = [...ids]
    return { ...filters, topics: [{ op: "in", value: expanded.length > 0 ? expanded : [NO_MATCH_CLUSTER_ID] }] }
  })
