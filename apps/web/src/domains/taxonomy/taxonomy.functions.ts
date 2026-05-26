import { OrganizationId, ProjectId } from "@domain/shared"
import {
  getLastRunUseCase,
  getTaxonomyAnalyticsUseCase,
  listCategoriesUseCase,
  type TaxonomyCategory,
  type TaxonomyCluster,
  type TaxonomyClusterLineage,
  TaxonomyClusterRepository,
  type TaxonomyClusterTrendSummary,
  type TaxonomyRun,
} from "@domain/taxonomy"
import { BehaviorObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  TaxonomyCategoryRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"

export interface TaxonomyClusterRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly parentCategoryId: string | null
  readonly name: string
  readonly description: string
  readonly observationCount: number
  readonly state: TaxonomyCluster["state"]
  readonly firstObservedAt: string
  readonly lastObservedAt: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface TaxonomyCategoryRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly name: string
  readonly description: string
  readonly clusterCount: number
  readonly observationCount: number
  readonly state: TaxonomyCategory["state"]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface TaxonomyRunRecord {
  readonly id: string
  readonly trigger: TaxonomyRun["trigger"]
  readonly status: TaxonomyRun["status"]
  readonly startedAt: string
  readonly completedAt: string | null
  readonly observationsScanned: number
  readonly noiseScanned: number
  readonly clustersBorn: number
  readonly clustersMerged: number
  readonly clustersDeprecated: number
  readonly categoriesRebuilt: number
  readonly error: string | null
}

export interface TaxonomyLineageRecord {
  readonly id: string
  readonly transitionType: TaxonomyClusterLineage["transitionType"]
  readonly fromClusterIds: readonly string[]
  readonly toClusterIds: readonly string[]
  readonly similarity: number | null
  readonly createdAt: string
}

export interface TaxonomyCategoryWithClustersRecord {
  readonly category: TaxonomyCategoryRecord
  readonly clusters: readonly TaxonomyClusterRecord[]
}

export interface TaxonomyOverviewRecord {
  readonly totalActiveCategories: number
  readonly totalActiveClusters: number
  readonly totalObservations: number
  readonly topClusters: readonly (TaxonomyClusterRecord & {
    readonly occurrences: number
    readonly trend: TaxonomyClusterTrendSummary
  })[]
  readonly categories: readonly TaxonomyCategoryWithClustersRecord[]
  readonly lastRun: TaxonomyRunRecord | null
  readonly recentLineage: readonly TaxonomyLineageRecord[]
}

const postgresTaxonomyReadLayer = Layer.mergeAll(
  TaxonomyCategoryRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
)

const toClusterRecord = (cluster: TaxonomyCluster): TaxonomyClusterRecord => ({
  id: cluster.id,
  organizationId: cluster.organizationId,
  projectId: cluster.projectId,
  parentCategoryId: cluster.parentCategoryId,
  name: cluster.name,
  description: cluster.description,
  observationCount: cluster.observationCount,
  state: cluster.state,
  firstObservedAt: cluster.firstObservedAt.toISOString(),
  lastObservedAt: cluster.lastObservedAt.toISOString(),
  createdAt: cluster.createdAt.toISOString(),
  updatedAt: cluster.updatedAt.toISOString(),
})

const toCategoryRecord = (category: TaxonomyCategory): TaxonomyCategoryRecord => ({
  id: category.id,
  organizationId: category.organizationId,
  projectId: category.projectId,
  name: category.name,
  description: category.description,
  clusterCount: category.clusterCount,
  observationCount: category.observationCount,
  state: category.state,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString(),
})

const toRunRecord = (run: TaxonomyRun): TaxonomyRunRecord => ({
  id: run.id,
  trigger: run.trigger,
  status: run.status,
  startedAt: run.startedAt.toISOString(),
  completedAt: run.completedAt?.toISOString() ?? null,
  observationsScanned: run.observationsScanned,
  noiseScanned: run.noiseScanned,
  clustersBorn: run.clustersBorn,
  clustersMerged: run.clustersMerged,
  clustersDeprecated: run.clustersDeprecated,
  categoriesRebuilt: run.categoriesRebuilt,
  error: run.error,
})

const toLineageRecord = (lineage: TaxonomyClusterLineage): TaxonomyLineageRecord => ({
  id: lineage.id,
  transitionType: lineage.transitionType,
  fromClusterIds: lineage.fromClusterIds,
  toClusterIds: lineage.toClusterIds,
  similarity: lineage.similarity,
  createdAt: lineage.createdAt.toISOString(),
})

export const getTaxonomyOverview = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<TaxonomyOverviewRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const analytics = yield* getTaxonomyAnalyticsUseCase({ organizationId: orgId, projectId })
        const categoryResult = yield* listCategoriesUseCase({ organizationId: orgId, projectId, includeEmpty: false })
        const clusters = yield* TaxonomyClusterRepository
        const categories = yield* Effect.forEach(
          categoryResult.categories,
          (category) =>
            clusters
              .list({
                projectId,
                state: "active",
                parentCategoryId: category.id,
                sort: "observation_count_desc",
                limit: 100,
                offset: 0,
              })
              .pipe(
                Effect.map((page) => ({
                  category: toCategoryRecord(category),
                  clusters: page.items.map(toClusterRecord),
                })),
              ),
          { concurrency: 4 },
        )
        const lastRun = yield* getLastRunUseCase({ organizationId: orgId, projectId })

        return {
          totalActiveCategories: analytics.totalActiveCategories,
          totalActiveClusters: analytics.totalActiveClusters,
          totalObservations: analytics.totalObservations,
          topClusters: analytics.topClusters.map((row) => ({
            ...toClusterRecord(row.cluster),
            occurrences: row.occurrences,
            trend: row.trend,
          })),
          categories,
          lastRun: lastRun.run ? toRunRecord(lastRun.run) : null,
          recentLineage: lastRun.lineage.map(toLineageRecord),
        } satisfies TaxonomyOverviewRecord
      }).pipe(
        withPostgres(postgresTaxonomyReadLayer, getPostgresClient(), orgId),
        withClickHouse(BehaviorObservationRepositoryLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })
