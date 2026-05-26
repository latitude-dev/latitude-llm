import { AI } from "@domain/ai"
import type { OrganizationId, ProjectId, TaxonomyCategoryId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_EMBEDDING_DIMENSIONS, TAXONOMY_EMBEDDING_MODEL } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { normalizeTaxonomyEmbedding } from "../helpers.ts"
import { TaxonomyClusterRepository, type TaxonomyClusterSort } from "../ports/taxonomy-cluster-repository.ts"

export interface ListClustersInCategoryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly categoryId: TaxonomyCategoryId
  readonly state?: TaxonomyCluster["state"]
  readonly sort?: TaxonomyClusterSort
  readonly cursor?: string
  readonly pageSize?: number
}

export interface ListTaxonomyClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly state?: TaxonomyCluster["state"]
  readonly parentCategoryId?: TaxonomyCategoryId
  readonly search?: string
  readonly sort?: TaxonomyClusterSort
  readonly cursor?: string
  readonly pageSize?: number
}

export interface TaxonomyClusterPage {
  readonly items: readonly TaxonomyCluster[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
  readonly pageSize: number
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

const pageSize = (input: number | undefined): number => Math.min(Math.max(input ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

const cursorToOffset = (cursor: string | undefined): number => {
  if (!cursor) return 0
  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const toPage = (input: {
  readonly items: readonly TaxonomyCluster[]
  readonly hasMore: boolean
  readonly offset: number
  readonly limit: number
}): TaxonomyClusterPage => ({
  items: input.items,
  hasMore: input.hasMore,
  nextCursor: input.hasMore ? String(input.offset + input.items.length) : null,
  pageSize: input.limit,
})

export const listClustersInCategoryUseCase = (input: ListClustersInCategoryInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.categoryId", input.categoryId)
    const clusters = yield* TaxonomyClusterRepository
    const limit = pageSize(input.pageSize)
    const offset = cursorToOffset(input.cursor)
    const result = yield* clusters.list({
      projectId: input.projectId,
      state: input.state ?? "active",
      parentCategoryId: input.categoryId,
      sort: input.sort ?? "observation_count_desc",
      limit,
      offset,
    })
    return toPage({ ...result, limit, offset })
  }).pipe(Effect.withSpan("taxonomy.listClustersInCategory"))

export const listClustersUseCase = (input: ListTaxonomyClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const clusters = yield* TaxonomyClusterRepository
    const limit = pageSize(input.pageSize)
    const offset = cursorToOffset(input.cursor)
    const search = input.search?.trim()

    if (search) {
      const ai = yield* AI
      const embedding = yield* ai.embed({
        text: search,
        model: TAXONOMY_EMBEDDING_MODEL,
        dimensions: TAXONOMY_EMBEDDING_DIMENSIONS,
        inputType: "query",
      })
      const candidates = yield* clusters.hybridSearch({
        projectId: input.projectId,
        query: search,
        normalizedEmbedding: normalizeTaxonomyEmbedding(embedding.embedding),
        state: input.state ?? "active",
        ...(input.parentCategoryId === undefined ? {} : { parentCategoryId: input.parentCategoryId }),
        limit: limit + 1,
        offset,
      })
      const candidatePage = candidates.slice(0, limit)
      const clusterRows = yield* clusters.listByIds(candidatePage.map((candidate) => candidate.clusterId))
      const clusterById = new Map(clusterRows.map((cluster) => [cluster.id, cluster] as const))
      const items = candidatePage.flatMap((candidate) => {
        const cluster = clusterById.get(candidate.clusterId)
        return cluster ? [cluster] : []
      })
      return {
        items,
        hasMore: candidates.length > limit,
        nextCursor: candidates.length > limit ? String(offset + candidatePage.length) : null,
        pageSize: limit,
      } satisfies TaxonomyClusterPage
    }

    const result = yield* clusters.list({
      projectId: input.projectId,
      state: input.state ?? "active",
      ...(input.parentCategoryId === undefined ? {} : { parentCategoryId: input.parentCategoryId }),
      sort: input.sort ?? "observation_count_desc",
      limit,
      offset,
    })
    return toPage({ ...result, limit, offset })
  }).pipe(Effect.withSpan("taxonomy.listClusters"))
