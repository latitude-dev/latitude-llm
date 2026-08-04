import { type OrganizationId, ProjectId } from "@domain/shared"
import type {
  CacheUsageMeasures,
  ClassifiedUnpricedPair,
  CostAnalyticsScope,
  CostBreakdown,
  CostPerSessionDecomposition,
  JudgedCacheModel,
  ModelUsageMeasures,
  ModelUsageSlice,
} from "@domain/spans"
import {
  COST_BREAKDOWN_DIMENSIONS,
  COST_SERIES_METRICS,
  CostAnalyticsRepository,
  decomposeCostPerSession,
  isUnpricedGap,
  judgeCacheEconomics,
  sessionCostTokens,
  summarizeUnpricedUsage,
} from "@domain/spans"
import { CostAnalyticsRepositoryLive } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getClickhouseClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"

// Wire records: Dates serialized to ISO strings, costs left in microcents.

/**
 * The window's precision, already reconciled against the pricing registry so the
 * UI never has to guess whether a zero-cost model is a gap or genuinely free.
 */
export interface CostConfidenceRecord {
  readonly verifiedMicrocents: number
  readonly estimatedMicrocents: number
  readonly billableTokens: number
  readonly pricedCoverage: number | null
  readonly gapTokens: number
  readonly gapCalls: number
  readonly gapPairs: readonly ClassifiedUnpricedPair[]
  readonly freeTokens: number
  /** Spans whose cost is excluded from the total, for the shared rollup cost display. */
  readonly unpricedCalls: number
  /** Zero-cost usage stored before `costSource` existed, so coverage is a lower bound. */
  readonly unknownTokens: number
  readonly unknownCalls: number
}

export interface CostOverviewRecord {
  readonly totalMicrocents: number
  readonly tracesWithUsage: number
  readonly avgPerTraceMicrocents: number
  readonly topSpendModel: { readonly model: string; readonly provider: string; readonly costMicrocents: number } | null
  readonly confidence: CostConfidenceRecord
}

export interface CostSeriesBucketRecord {
  readonly bucketStartIso: string
  readonly valueMicrocents: number
  readonly byModel: readonly { readonly model: string; readonly costMicrocents: number }[]
}

export interface ModelUsageBucketRecord {
  readonly bucketStartIso: string
  readonly byModel: readonly ModelUsageSlice[]
  readonly other: ModelUsageMeasures
}

export interface ModelUsageSeriesRecord {
  readonly buckets: readonly ModelUsageBucketRecord[]
  readonly models: readonly string[]
  readonly otherModels: number
}

/**
 * One model's cache position and verdict, judged at its documented cache lifetime and
 * at every lifetime the panel can explore.
 *
 * Rates are exactly measured from token counts; the break-even, the lifetime the
 * ceiling is read against, and the modeled savings all come from the pricing registry,
 * which the browser entry cannot reach — so every lifetime is priced here and the panel
 * only ever switches between precomputed judgments.
 */
export interface CacheModelRecord extends JudgedCacheModel {}

export interface CacheEconomicsRecord {
  readonly rows: readonly CacheModelRecord[]
  readonly totals: CacheUsageMeasures & { readonly distinctModels: number }
}

/**
 * The decomposition as the card renders it: the arithmetic is done here, so the
 * panel receives a headline, a total, and rows it only has to lay out.
 */
export interface CostPerSessionRecord extends CostPerSessionDecomposition {
  /**
   * Share of this window's sessions keyed on a trace id because the traffic
   * reported no session id. Above a small share, "cost per session" is largely
   * cost per trace wearing another name, which the card has to say out loud.
   */
  readonly traceKeyedSessionShare: number | null
  /** Both feed the shared rollup cost display, so a zero headline never reads as free. */
  readonly unpricedCalls: number
  readonly tokens: number
  /** Sparkline points for the two headline blocks, spanning both windows, oldest first. */
  readonly buckets: readonly SessionCostSparkPoint[]
}

/** Cost per session is derived here rather than in the panel: an empty bucket has none. */
export interface SessionCostSparkPoint {
  readonly bucketStartIso: string
  readonly sessions: number
  readonly costMicrocents: number
  readonly costPerSessionMicrocents: number | null
}

// Well above what any window the picker offers can ask for at its bucket width.
const MAX_SERIES_BUCKETS = 1_000

const costScopeSchema = z.object({
  projectId: z.string(),
  fromIso: z.string().datetime(),
  toIso: z.string().datetime(),
})

const toScope = (orgId: OrganizationId, data: z.infer<typeof costScopeSchema>): CostAnalyticsScope => ({
  organizationId: orgId,
  projectId: ProjectId(data.projectId),
  from: new Date(data.fromIso),
  to: new Date(data.toIso),
})

export const getCostOverview = createServerFn({ method: "GET" })
  .inputValidator(costScopeSchema)
  .handler(async ({ data, context }): Promise<CostOverviewRecord> => {
    const orgId = await resolveOrgScope(context)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CostAnalyticsRepository
        const overview = yield* repo.getCostOverview(toScope(orgId, data))
        const { confidence } = overview
        const unpriced = summarizeUnpricedUsage({
          zeroCostPairs: confidence.zeroCostPairs,
          zeroCostTokens: confidence.unpricedTokens + confidence.unknownTokens,
          zeroCostCalls: confidence.unpricedCalls + confidence.unknownCalls,
          billableTokens: confidence.billableTokens,
        })
        return {
          totalMicrocents: overview.totalMicrocents,
          tracesWithUsage: overview.tracesWithUsage,
          avgPerTraceMicrocents: overview.avgPerTraceMicrocents,
          topSpendModel: overview.topSpendModel,
          confidence: {
            verifiedMicrocents: confidence.verifiedMicrocents,
            estimatedMicrocents: confidence.estimatedMicrocents,
            billableTokens: confidence.billableTokens,
            pricedCoverage: unpriced.pricedCoverage,
            gapTokens: unpriced.gapTokens,
            gapCalls: unpriced.gapCalls,
            gapPairs: unpriced.pairs.filter(isUnpricedGap),
            freeTokens: unpriced.freeTokens,
            unpricedCalls: confidence.unpricedCalls,
            unknownTokens: confidence.unknownTokens,
            unknownCalls: confidence.unknownCalls,
          },
        }
      }).pipe(withScopedClickHouse(CostAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

const bucketSecondsSchema = z
  .number()
  .int()
  .positive()
  .max(90 * 24 * 60 * 60)

// Counts the aligned positions the client will densify to, not the raw duration: the start floors to a boundary.
const withinBucketBudget = (input: { fromIso: string; toIso: string; bucketSeconds: number }) => {
  const stepMs = input.bucketSeconds * 1000
  return (
    Math.ceil(Date.parse(input.toIso) / stepMs) - Math.floor(Date.parse(input.fromIso) / stepMs) <= MAX_SERIES_BUCKETS
  )
}

const bucketBudgetIssue = {
  message: `The window and bucket width must yield at most ${MAX_SERIES_BUCKETS} buckets`,
  path: ["bucketSeconds"],
}

export const getCostSeries = createServerFn({ method: "GET" })
  .inputValidator(
    costScopeSchema
      .extend({ metric: z.enum(COST_SERIES_METRICS), bucketSeconds: bucketSecondsSchema })
      .refine(withinBucketBudget, bucketBudgetIssue),
  )
  .handler(async ({ data, context }): Promise<readonly CostSeriesBucketRecord[]> => {
    const orgId = await resolveOrgScope(context)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CostAnalyticsRepository
        const buckets = yield* repo.getCostSeries({
          ...toScope(orgId, data),
          metric: data.metric,
          bucketSeconds: data.bucketSeconds,
        })
        return buckets.map((bucket) => ({
          bucketStartIso: bucket.bucketStart.toISOString(),
          valueMicrocents: bucket.valueMicrocents,
          byModel: bucket.byModel.map((slice) => ({ model: slice.model, costMicrocents: slice.costMicrocents })),
        }))
      }).pipe(withScopedClickHouse(CostAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getCostBreakdown = createServerFn({ method: "GET" })
  .inputValidator(costScopeSchema.extend({ dimension: z.enum(COST_BREAKDOWN_DIMENSIONS) }))
  .handler(async ({ data, context }): Promise<CostBreakdown> => {
    const orgId = await resolveOrgScope(context)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CostAnalyticsRepository
        return yield* repo.getCostBreakdown({ ...toScope(orgId, data), dimension: data.dimension })
      }).pipe(withScopedClickHouse(CostAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getCacheEconomics = createServerFn({ method: "GET" })
  .inputValidator(costScopeSchema)
  .handler(async ({ data, context }): Promise<CacheEconomicsRecord> => {
    const orgId = await resolveOrgScope(context)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CostAnalyticsRepository
        const scope = toScope(orgId, data)
        const economics = yield* repo.getCacheEconomics(scope)
        return {
          rows: judgeCacheEconomics({ economics, windowMs: scope.to.getTime() - scope.from.getTime() }),
          totals: economics.totals,
        }
      }).pipe(withScopedClickHouse(CostAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

/**
 * Why average cost per session moved against the window immediately before it.
 *
 * The comparison window is derived here rather than accepted from the client: it
 * is the same length ending where the shown window starts, so the two halves of a
 * period-over-period figure cannot drift apart.
 */
export const getCostPerSessionDecomposition = createServerFn({ method: "GET" })
  .inputValidator(
    costScopeSchema.extend({ bucketSeconds: bucketSecondsSchema }).refine(withinBucketBudget, bucketBudgetIssue),
  )
  .handler(async ({ data, context }): Promise<CostPerSessionRecord> => {
    const orgId = await resolveOrgScope(context)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CostAnalyticsRepository
        const scope = toScope(orgId, data)
        const { previous, current, buckets } = yield* repo.getSessionCostFactors({
          ...scope,
          previousFrom: new Date(scope.from.getTime() - (scope.to.getTime() - scope.from.getTime())),
          bucketSeconds: data.bucketSeconds,
        })
        return {
          ...decomposeCostPerSession({ previous, current }),
          traceKeyedSessionShare: current.sessions > 0 ? current.traceKeyedSessions / current.sessions : null,
          unpricedCalls: current.unpricedCalls,
          tokens: sessionCostTokens(current),
          buckets: buckets.map((bucket) => ({
            bucketStartIso: bucket.bucketStart.toISOString(),
            sessions: bucket.sessions,
            costMicrocents: bucket.costMicrocents,
            costPerSessionMicrocents: bucket.sessions > 0 ? bucket.costMicrocents / bucket.sessions : null,
          })),
        }
      }).pipe(withScopedClickHouse(CostAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })

export const getModelUsageSeries = createServerFn({ method: "GET" })
  .inputValidator(
    costScopeSchema.extend({ bucketSeconds: bucketSecondsSchema }).refine(withinBucketBudget, bucketBudgetIssue),
  )
  .handler(async ({ data, context }): Promise<ModelUsageSeriesRecord> => {
    const orgId = await resolveOrgScope(context)
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* CostAnalyticsRepository
        const series = yield* repo.getModelUsageSeries({
          ...toScope(orgId, data),
          bucketSeconds: data.bucketSeconds,
        })
        return {
          buckets: series.buckets.map((bucket) => ({
            bucketStartIso: bucket.bucketStart.toISOString(),
            byModel: bucket.byModel,
            other: bucket.other,
          })),
          models: series.models,
          otherModels: series.otherModels,
        }
      }).pipe(withScopedClickHouse(CostAnalyticsRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })
