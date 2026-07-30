import { type OrganizationId, ProjectId } from "@domain/shared"
import type { ClassifiedUnpricedPair, CostAnalyticsScope } from "@domain/spans"
import { COST_SERIES_METRICS, CostAnalyticsRepository, isUnpricedGap, summarizeUnpricedUsage } from "@domain/spans"
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

export const getCostSeries = createServerFn({ method: "GET" })
  .inputValidator(
    costScopeSchema.extend({
      metric: z.enum(COST_SERIES_METRICS),
      bucketSeconds: z
        .number()
        .int()
        .positive()
        .max(90 * 24 * 60 * 60),
    }),
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
