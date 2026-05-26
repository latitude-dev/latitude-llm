import { generateId, type OrganizationId, type ProjectId, TaxonomyCategoryId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_CATEGORY_CONTINUATION_THRESHOLD, TAXONOMY_HIERARCHY_MAX_CATEGORIES } from "../constants.ts"
import type { TaxonomyCategory } from "../entities/category.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { agglomerativeCluster, clamp, cosineSimilarity, meanNormalized, normalizeTaxonomyCentroid } from "../helpers.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface RebuildCategoryHierarchyInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly now?: Date
}

export interface RebuildCategoryHierarchyResult {
  readonly categoriesRebuilt: number
  readonly clustersAssigned: number
  readonly categoriesDeprecated: number
}

const chooseCategoryCount = (activeClusterCount: number): number =>
  clamp(Math.round(Math.sqrt(activeClusterCount)), 3, TAXONOMY_HIERARCHY_MAX_CATEGORIES)

const findBestPriorCategory = (input: {
  readonly priorCategories: readonly TaxonomyCategory[]
  readonly matchedCategoryIds: ReadonlySet<TaxonomyCategory["id"]>
  readonly centroidEmbedding: readonly number[]
}): { readonly category: TaxonomyCategory; readonly cosine: number } | null => {
  let best: { readonly category: TaxonomyCategory; readonly cosine: number } | null = null
  for (const category of input.priorCategories) {
    if (input.matchedCategoryIds.has(category.id) || category.centroidEmbedding.length === 0) continue
    const cosine = cosineSimilarity(input.centroidEmbedding, category.centroidEmbedding)
    if (!best || cosine > best.cosine) best = { category, cosine }
  }
  return best
}

const buildCategory = (input: {
  readonly id: TaxonomyCategory["id"]
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly memberClusters: readonly TaxonomyCluster[]
  readonly centroidEmbedding: readonly number[]
  readonly now: Date
  readonly existing?: TaxonomyCategory
}): TaxonomyCategory => ({
  id: input.id,
  organizationId: input.organizationId,
  projectId: input.projectId,
  name: input.existing?.name ?? "Pending",
  description: input.existing?.description ?? "",
  centroidEmbedding: [...input.centroidEmbedding],
  clusterCount: input.memberClusters.length,
  observationCount: input.memberClusters.reduce((sum, cluster) => sum + cluster.observationCount, 0),
  state: "active",
  clusteredAt: input.now,
  createdAt: input.existing?.createdAt ?? input.now,
  updatedAt: input.now,
})

export const rebuildCategoryHierarchyUseCase = (input: RebuildCategoryHierarchyInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const now = input.now ?? new Date()
    const clusters = yield* TaxonomyClusterRepository
    const categories = yield* TaxonomyCategoryRepository
    const activeClusters = (yield* clusters.listActiveByProject({
      projectId: input.projectId,
    })).filter((cluster) => cluster.observationCount > 0 && normalizeTaxonomyCentroid(cluster.centroid).length > 0)

    if (activeClusters.length === 0) {
      const priorCategories = yield* categories.listByProject({
        projectId: input.projectId,
        state: "active",
      })
      for (const category of priorCategories) {
        yield* categories.markDeprecated({ categoryId: category.id, timestamp: now })
      }
      return {
        categoriesRebuilt: 0,
        clustersAssigned: 0,
        categoriesDeprecated: priorCategories.length,
      } satisfies RebuildCategoryHierarchyResult
    }

    const vectors = activeClusters.map((cluster) => normalizeTaxonomyCentroid(cluster.centroid))
    const targetK = chooseCategoryCount(activeClusters.length)
    const assignment = agglomerativeCluster({ vectors, k: targetK })
    const priorActiveCategories = yield* categories.listByProject({
      projectId: input.projectId,
      state: "active",
    })
    const matchedCategoryIds = new Set<TaxonomyCategory["id"]>()
    const clusterAssignments: Array<{
      clusterId: TaxonomyCluster["id"]
      parentCategoryId: TaxonomyCategory["id"] | null
    }> = []
    let categoriesRebuilt = 0

    for (const memberIndices of assignment.clusters) {
      const memberClusters = memberIndices
        .map((index) => activeClusters[index])
        .filter((cluster) => cluster !== undefined)
      if (memberClusters.length === 0) continue
      const centroidEmbedding = meanNormalized(
        memberClusters.map((cluster) => normalizeTaxonomyCentroid(cluster.centroid)),
      )
      const best = findBestPriorCategory({
        priorCategories: priorActiveCategories,
        matchedCategoryIds,
        centroidEmbedding,
      })
      const existing = best && best.cosine >= TAXONOMY_CATEGORY_CONTINUATION_THRESHOLD ? best.category : undefined
      const categoryId = existing?.id ?? TaxonomyCategoryId(generateId())
      const category = buildCategory({
        id: categoryId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        memberClusters,
        centroidEmbedding,
        now,
        ...(existing ? { existing } : {}),
      })
      yield* categories.save(category)
      matchedCategoryIds.add(category.id)
      categoriesRebuilt++
      for (const cluster of memberClusters) {
        clusterAssignments.push({ clusterId: cluster.id, parentCategoryId: category.id })
      }
    }

    yield* clusters.bulkUpdateParentCategory({
      projectId: input.projectId,
      assignments: clusterAssignments,
    })

    let categoriesDeprecated = 0
    for (const category of priorActiveCategories) {
      if (matchedCategoryIds.has(category.id)) continue
      yield* categories.markDeprecated({ categoryId: category.id, timestamp: now })
      categoriesDeprecated++
    }

    return {
      categoriesRebuilt,
      clustersAssigned: clusterAssignments.length,
      categoriesDeprecated,
    } satisfies RebuildCategoryHierarchyResult
  }).pipe(Effect.withSpan("taxonomy.rebuildCategoryHierarchy"))
