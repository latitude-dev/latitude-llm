import {
  NotFoundError,
  type OrganizationId,
  type ProjectId,
  type TaxonomyCategoryId,
  type TaxonomyClusterId,
} from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCategory } from "../entities/category.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyObservation } from "../entities/observation.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface GetClusterDetailsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  readonly sampleSize?: number
}

export interface GetClusterDetailsResult {
  readonly cluster: TaxonomyCluster
  readonly recentObservations: readonly TaxonomyObservation[]
}

export interface GetCategoryDetailsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly categoryId: TaxonomyCategoryId
  readonly clusterLimit?: number
}

export interface GetCategoryDetailsResult {
  readonly category: TaxonomyCategory
  readonly clusters: readonly TaxonomyCluster[]
}

const clampLimit = (value: number | undefined, fallback: number, max: number): number =>
  Math.min(Math.max(value ?? fallback, 1), max)

export const getClusterDetailsUseCase = (input: GetClusterDetailsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* BehaviorObservationRepository
    const cluster = yield* clusters.findById(input.clusterId)
    if (cluster.organizationId !== input.organizationId || cluster.projectId !== input.projectId) {
      return yield* new NotFoundError({ entity: "TaxonomyCluster", id: input.clusterId })
    }
    const recentObservations = yield* observations.listByCluster({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      limit: clampLimit(input.sampleSize, 5, 20),
    })
    return { cluster, recentObservations } satisfies GetClusterDetailsResult
  }).pipe(Effect.withSpan("taxonomy.getClusterDetails"))

export const getCategoryDetailsUseCase = (input: GetCategoryDetailsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.categoryId", input.categoryId)
    const categories = yield* TaxonomyCategoryRepository
    const clusters = yield* TaxonomyClusterRepository
    const category = yield* categories.findById(input.categoryId)
    if (category.organizationId !== input.organizationId || category.projectId !== input.projectId) {
      return yield* new NotFoundError({ entity: "TaxonomyCategory", id: input.categoryId })
    }
    const clusterPage = yield* clusters.list({
      projectId: input.projectId,
      state: "active",
      parentCategoryId: input.categoryId,
      sort: "observation_count_desc",
      limit: clampLimit(input.clusterLimit, 50, 100),
      offset: 0,
    })
    return { category, clusters: clusterPage.items } satisfies GetCategoryDetailsResult
  }).pipe(Effect.withSpan("taxonomy.getCategoryDetails"))
