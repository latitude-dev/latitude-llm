import type { ModelConfig, SeedScope } from "@domain/shared/seeding"
import type { CostSource } from "@domain/spans"
import {
  assistantTextMessage,
  CACHE_OFF,
  type CacheProfile,
  makeLlmSpan,
  type SpanRow,
  type TraceContext,
  toBase,
  userMessage,
} from "../span-builders.ts"

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Traffic arrives in clusters rather than at a flat rate, which is what gives the
 * achievable ceiling something to read: gaps inside a cluster are short enough to
 * hit a warm cache, the gap between clusters is not. A cohort's ceiling is
 * therefore `(callsPerCluster - 1) / callsPerCluster`, computable by hand — and
 * `callsPerCluster: 1` is a cohort whose ceiling is zero however it caches.
 */
export interface CohortCadence {
  /** The newest call lands exactly this many days before the anchor. */
  readonly endDaysAgo: number
  readonly clusters: number
  readonly clusterSpacingHours: number
  readonly callsPerCluster: number
  readonly gapWithinClusterSeconds: number
}

/**
 * Per-call cache behaviour. A flat profile pins the aggregate rate directly,
 * which is what the deliberately-broken cohorts need. `prefixReuse` instead
 * models a warm prefix honestly — the first call of a cluster writes it and the
 * rest read it — so the measured rate falls out of the cadence rather than being
 * asserted independently of it.
 */
export type CohortCache =
  | { readonly kind: "off" }
  | { readonly kind: "flat"; readonly profile: CacheProfile }
  | { readonly kind: "prefixReuse"; readonly share: number }

export interface CostCohort {
  readonly key: string
  readonly serviceName: string
  readonly modelConfig: ModelConfig
  readonly cadence: CohortCadence
  readonly cache: CohortCache
  readonly promptTokens: number
  readonly completionTokens: number
  /** `1` is a single-turn workload; `0` writes no session id at all. */
  readonly callsPerSession: number
  /**
   * Overrides the builder's `estimated`. `""` is a row written before the column
   * existed, which reads back as `unknown` — the one bucket nothing else produces.
   */
  readonly costSource?: CostSource | ""
}

export const cohortCalls = (cohort: CostCohort): number => cohort.cadence.clusters * cohort.cadence.callsPerCluster

/** Longest a cluster may run before it collides with the next one. */
export const cohortClusterDurationMs = (cadence: CohortCadence): number =>
  (cadence.callsPerCluster - 1) * cadence.gapWithinClusterSeconds * SECOND_MS

const cacheProfileFor = (cache: CohortCache, callInCluster: number): CacheProfile => {
  switch (cache.kind) {
    case "off":
      return CACHE_OFF
    case "flat":
      return cache.profile
    case "prefixReuse":
      return callInCluster === 0 ? { hitRate: 0, writeShare: cache.share } : { hitRate: cache.share, writeShare: 0 }
  }
}

/**
 * `estimated` rows keep the modelled cost the builder computed. Everything else
 * either restates who reported that cost, or zeroes it: `unpriced` and the empty
 * pre-migration value are both "tokens moved, no dollars recorded".
 */
const applyCostSource = (span: SpanRow, source: CostSource | ""): void => {
  if (source === "estimated") return
  span.cost_source = source
  if (source === "provider_reported") {
    span.cost_is_estimated = 0
    return
  }
  span.cost_input_microcents = 0
  span.cost_output_microcents = 0
  span.cost_total_microcents = 0
  span.cost_is_estimated = 0
}

const buildCohortSpans = (cohort: CostCohort, scope: SeedScope, anchorMs: number): SpanRow[] => {
  const { cadence } = cohort
  const spans: SpanRow[] = []
  const newestCallMs = anchorMs - cadence.endDaysAgo * DAY_MS
  let index = 0

  for (let cluster = 0; cluster < cadence.clusters; cluster++) {
    // Clusters are laid out backwards from the newest call, and each cluster's
    // last call is its anchor, so nothing can drift past `newestCallMs`.
    const clusterEndMs = newestCallMs - (cadence.clusters - 1 - cluster) * cadence.clusterSpacingHours * HOUR_MS

    for (let call = 0; call < cadence.callsPerCluster; call++) {
      const startMs = clusterEndMs - (cadence.callsPerCluster - 1 - call) * cadence.gapWithinClusterSeconds * SECOND_MS
      const start = new Date(startMs)
      const ctx: TraceContext = {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        apiKeyId: scope.apiKeyId,
        simulationId: "",
        startTime: start,
        sessionId:
          cohort.callsPerSession > 0
            ? scope.traceHex(`${cohort.key}:session`, Math.floor(index / cohort.callsPerSession))
            : "",
        userId: "",
        userEmail: "",
        serviceName: cohort.serviceName,
        tags: ["cost-qa", cohort.key],
        metadata: {},
      }

      const span = makeLlmSpan({
        base: toBase(ctx, scope.traceHex(cohort.key, index), "", start, 1_800),
        modelConfig: cohort.modelConfig,
        inputMessages: [userMessage(`${cohort.key} request ${index}`)],
        outputMessages: [assistantTextMessage(`${cohort.key} response ${index}`)],
        systemInstructions: `You are the ${cohort.serviceName} agent.`,
        finishReason: cohort.modelConfig.finishReasonStop,
        promptTokens: cohort.promptTokens,
        completionTokens: cohort.completionTokens,
        cacheProfile: cacheProfileFor(cohort.cache, call),
      })
      // The builder assigns a random span id; the idempotency sentinel needs a stable one.
      span.span_id = scope.spanHex(cohort.key, index)
      span.agent_name = cohort.serviceName
      if (cohort.costSource !== undefined) applyCostSource(span, cohort.costSource)

      spans.push(span)
      index++
    }
  }

  return spans
}

export const buildCohortsSpans = (cohorts: readonly CostCohort[], scope: SeedScope, anchorMs: number): SpanRow[] =>
  cohorts.flatMap((cohort) => buildCohortSpans(cohort, scope, anchorMs))
