import type { OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_LIST_ALL_BY_CLUSTER_MAX } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyClusterLineage, TaxonomyRun } from "../entities/lineage.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyLineageRepository } from "../ports/taxonomy-lineage-repository.ts"
import { TaxonomyRunRepository } from "../ports/taxonomy-run-repository.ts"

export interface GetClusterTrendInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  readonly windowDays?: number
  readonly now?: Date
}

interface ClusterTrendBucket {
  readonly date: string
  readonly count: number
}

export interface GetClusterTrendResult {
  readonly buckets: readonly ClusterTrendBucket[]
}

export interface GetTaxonomyAnalyticsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly windowDays?: number
  readonly now?: Date
}

export interface TopTaxonomyCluster {
  readonly cluster: TaxonomyCluster
  readonly occurrences: number
}

export interface GetTaxonomyAnalyticsResult {
  readonly totalActiveCategories: number
  readonly totalActiveClusters: number
  /** Total observation count over the analytics window (default 14 days). */
  readonly totalObservations: number
  readonly topClusters: readonly TopTaxonomyCluster[]
}

export interface GetLastRunInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export interface GetLastRunResult {
  readonly run: TaxonomyRun | null
  readonly lineage: readonly TaxonomyClusterLineage[]
}

const MS_PER_DAY = 24 * 60 * 60_000

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
const dayKey = (date: Date): string => startOfUtcDay(date).toISOString().slice(0, 10)
const windowStart = (now: Date, windowDays: number): Date =>
  startOfUtcDay(new Date(now.getTime() - (windowDays - 1) * MS_PER_DAY))

export const getClusterTrendUseCase = (input: GetClusterTrendInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const observations = yield* BehaviorObservationRepository
    const now = input.now ?? new Date()
    const days = Math.max(input.windowDays ?? 14, 1)
    const since = windowStart(now, days)
    const counts = new Map<string, number>()
    for (let index = 0; index < days; index++) {
      counts.set(dayKey(new Date(since.getTime() + index * MS_PER_DAY)), 0)
    }
    const rows = yield* observations.listAllByCluster({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
    })
    for (const row of rows) {
      if (row.startTime < since || row.startTime > now) continue
      const key = dayKey(row.startTime)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return { buckets: [...counts.entries()].map(([date, count]) => ({ date, count })) } satisfies GetClusterTrendResult
  }).pipe(Effect.withSpan("taxonomy.getClusterTrend"))

export const getTaxonomyAnalyticsUseCase = (input: GetTaxonomyAnalyticsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const now = input.now ?? new Date()
    const days = Math.max(input.windowDays ?? 14, 1)
    const since = windowStart(now, days)
    const categories = yield* TaxonomyCategoryRepository
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* BehaviorObservationRepository
    const activeCategories = yield* categories.listByProject({
      projectId: input.projectId,
      state: "active",
    })
    const topOccurrences = yield* observations.getTopClustersByOccurrence({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since,
      limit: 5,
    })
    const topClusterRows = yield* clusters.listByIds(topOccurrences.map((row) => row.clusterId))
    const clusterById = new Map(topClusterRows.map((cluster) => [cluster.id, cluster] as const))
    const topClusters = topOccurrences.flatMap((row) => {
      const cluster = clusterById.get(row.clusterId)
      return cluster && cluster.state === "active" ? [{ cluster, occurrences: row.count }] : []
    })
    const allActiveClusters = yield* clusters.listActiveByProject({
      projectId: input.projectId,
    })
    const counts = yield* observations.getCounts({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since,
    })
    return {
      totalActiveCategories: activeCategories.length,
      totalActiveClusters: allActiveClusters.length,
      totalObservations: counts.total,
      topClusters,
    } satisfies GetTaxonomyAnalyticsResult
  }).pipe(Effect.withSpan("taxonomy.getTaxonomyAnalytics"))

export const getLastRunUseCase = (input: GetLastRunInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const runs = yield* TaxonomyRunRepository
    const lineageRepository = yield* TaxonomyLineageRepository
    const run = yield* runs.findLatestByProject({ projectId: input.projectId })
    const lineage = yield* lineageRepository.listRecentByTransitionTypes({
      projectId: input.projectId,
      transitionTypes: ["birth", "merge"],
      limit: 10,
    })
    return { run, lineage } satisfies GetLastRunResult
  }).pipe(Effect.withSpan("taxonomy.getLastRun"))
