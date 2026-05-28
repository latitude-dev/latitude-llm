import { OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import {
  BehaviorObservationRepository,
  classifyClusterTrend,
  getLastRunUseCase,
  getTaxonomyAnalyticsUseCase,
  listCategoriesUseCase,
  TAXONOMY_TREND_BASELINE_DAYS,
  TAXONOMY_TREND_CURRENT_DAYS,
  TAXONOMY_TREND_MS_PER_DAY,
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

export type TaxonomyClusterWithTrendRecord = TaxonomyClusterRecord & {
  readonly trend: TaxonomyClusterTrendSummary
}

export interface TaxonomyCategoryWithClustersRecord {
  readonly category: TaxonomyCategoryRecord
  readonly trend: TaxonomyClusterTrendSummary | null
  readonly clusters: readonly TaxonomyClusterWithTrendRecord[]
}

export interface TaxonomyOverviewRecord {
  readonly totalActiveCategories: number
  readonly totalActiveClusters: number
  readonly totalObservations: number
  readonly topClusters: readonly (TaxonomyClusterWithTrendRecord & {
    readonly occurrences: number
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
        const now = new Date()
        const analytics = yield* getTaxonomyAnalyticsUseCase({ organizationId: orgId, projectId, now })
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
        const categoryClusterIds = categories.flatMap((item) =>
          item.clusters.map((cluster) => TaxonomyClusterId(cluster.id)),
        )
        const observations = yield* BehaviorObservationRepository
        const trendCounts =
          categoryClusterIds.length > 0
            ? yield* observations.getClusterTrendCounts({
                organizationId: orgId,
                projectId,
                clusterIds: categoryClusterIds,
                currentSince: new Date(now.getTime() - TAXONOMY_TREND_CURRENT_DAYS * TAXONOMY_TREND_MS_PER_DAY),
                baselineSince: new Date(
                  now.getTime() -
                    (TAXONOMY_TREND_CURRENT_DAYS + TAXONOMY_TREND_BASELINE_DAYS) * TAXONOMY_TREND_MS_PER_DAY,
                ),
                baselineDays: TAXONOMY_TREND_BASELINE_DAYS,
              })
            : []
        const trendCountByClusterId = new Map(trendCounts.map((trend) => [trend.clusterId, trend] as const))
        const trendByClusterId = new Map(
          trendCounts.map((trend) => [trend.clusterId, classifyClusterTrend(trend)] as const),
        )
        const emptyTrend = classifyClusterTrend({
          currentCount: 0,
          baselineCount: 0,
          baselineDays: TAXONOMY_TREND_BASELINE_DAYS,
        })
        const categoriesWithTrends = categories.map((item) => {
          const categoryTrendCounts = item.clusters.reduce(
            (totals, cluster) => {
              const trend = trendCountByClusterId.get(TaxonomyClusterId(cluster.id))
              if (!trend) return totals
              return {
                currentCount: totals.currentCount + trend.currentCount,
                baselineCount: totals.baselineCount + trend.baselineCount,
              }
            },
            { currentCount: 0, baselineCount: 0 },
          )

          return {
            category: item.category,
            trend:
              item.clusters.length > 0 &&
              (categoryTrendCounts.currentCount > 0 || categoryTrendCounts.baselineCount > 0)
                ? classifyClusterTrend({
                    ...categoryTrendCounts,
                    baselineDays: TAXONOMY_TREND_BASELINE_DAYS,
                  })
                : null,
            clusters: item.clusters.map((cluster) => ({
              ...cluster,
              trend: trendByClusterId.get(TaxonomyClusterId(cluster.id)) ?? emptyTrend,
            })),
          }
        })
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
          categories: categoriesWithTrends,
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
