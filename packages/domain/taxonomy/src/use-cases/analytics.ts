import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyClusterLineage, TaxonomyRun } from "../entities/lineage.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyLineageRepository } from "../ports/taxonomy-lineage-repository.ts"
import { TaxonomyRunRepository } from "../ports/taxonomy-run-repository.ts"

export interface GetTaxonomyAnalyticsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly windowDays?: number
  readonly now?: Date
}

export type TaxonomyClusterTrendStatus = "new" | "spike" | "rising" | "steady" | "cooling" | "fading"

export interface TaxonomyClusterTrendSummary {
  readonly status: TaxonomyClusterTrendStatus
  readonly currentCount: number
  readonly baselineCount: number
  readonly baselineDailyAverage: number
  readonly ratio: number | null
}

export interface TopTaxonomyCluster {
  readonly cluster: TaxonomyCluster
  readonly occurrences: number
  readonly trend: TaxonomyClusterTrendSummary
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
const TREND_CURRENT_DAYS = 1
const TREND_BASELINE_DAYS = 7

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
const windowStart = (now: Date, windowDays: number): Date =>
  startOfUtcDay(new Date(now.getTime() - (windowDays - 1) * MS_PER_DAY))

const classifyClusterTrend = (input: {
  readonly currentCount: number
  readonly baselineCount: number
  readonly baselineDays: number
}): TaxonomyClusterTrendSummary => {
  const baselineDailyAverage = input.baselineDays > 0 ? input.baselineCount / input.baselineDays : 0
  const ratio = baselineDailyAverage > 0 ? input.currentCount / baselineDailyAverage : null

  if (input.baselineCount === 0 && input.currentCount > 0) {
    return { status: "new", currentCount: input.currentCount, baselineCount: 0, baselineDailyAverage, ratio: null }
  }
  if (input.currentCount === 0 && input.baselineCount >= 3) {
    return { status: "fading", currentCount: 0, baselineCount: input.baselineCount, baselineDailyAverage, ratio }
  }
  if (input.currentCount >= 5 && ratio !== null && ratio >= 3) {
    return {
      status: "spike",
      currentCount: input.currentCount,
      baselineCount: input.baselineCount,
      baselineDailyAverage,
      ratio,
    }
  }
  if (input.currentCount >= 2 && ratio !== null && ratio >= 1.5) {
    return {
      status: "rising",
      currentCount: input.currentCount,
      baselineCount: input.baselineCount,
      baselineDailyAverage,
      ratio,
    }
  }
  if (ratio !== null && ratio <= 0.5) {
    return {
      status: "cooling",
      currentCount: input.currentCount,
      baselineCount: input.baselineCount,
      baselineDailyAverage,
      ratio,
    }
  }
  return {
    status: "steady",
    currentCount: input.currentCount,
    baselineCount: input.baselineCount,
    baselineDailyAverage,
    ratio,
  }
}

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
    const topClusterIds = topOccurrences.map((row) => row.clusterId)
    const topClusterRows = yield* clusters.listByIds(topClusterIds)
    const trendCounts = yield* observations.getClusterTrendCounts({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterIds: topClusterIds,
      currentSince: new Date(now.getTime() - TREND_CURRENT_DAYS * MS_PER_DAY),
      baselineSince: new Date(now.getTime() - (TREND_CURRENT_DAYS + TREND_BASELINE_DAYS) * MS_PER_DAY),
      baselineDays: TREND_BASELINE_DAYS,
    })
    const clusterById = new Map(topClusterRows.map((cluster) => [cluster.id, cluster] as const))
    const trendByClusterId = new Map(trendCounts.map((trend) => [trend.clusterId, trend] as const))
    const topClusters = topOccurrences.flatMap((row) => {
      const cluster = clusterById.get(row.clusterId)
      const trend = trendByClusterId.get(row.clusterId)
      return cluster && cluster.state === "active" && trend
        ? [{ cluster, occurrences: row.count, trend: classifyClusterTrend(trend) }]
        : []
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
