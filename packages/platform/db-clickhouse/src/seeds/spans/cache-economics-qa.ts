import type { ModelConfig, SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder } from "../types.ts"
import {
  assistantTextMessage,
  CACHE_OFF,
  type CacheProfile,
  makeLlmSpan,
  type SpanRow,
  type TraceContext,
  toBase,
  userMessage,
} from "./span-builders.ts"

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/**
 * Every cohort lands inside this trailing window, so the cost page's default
 * range shows all of them without reaching for All time.
 */
const CACHE_QA_WINDOW_DAYS = 7

/** Calls per session, so the fixture carries sessions rather than one-call pseudo-sessions. */
const CALLS_PER_SESSION = 4

/**
 * One cohort per cache state the panel can reach without an achievable ceiling,
 * plus the pair that makes break-even visibly a per-model property: an
 * Anthropic-style write premium (21.7%) beside models with no cache-write price
 * at all (0%).
 *
 * The models are deliberately ones the ambient generator never emits — they share
 * the seed project with its generated traces, and a collision would blend two
 * different cache stories into one row.
 */
interface CacheQaCohort {
  readonly key: string
  readonly serviceName: string
  readonly modelConfig: ModelConfig
  readonly calls: number
  readonly cacheProfile: CacheProfile
  readonly promptTokens: number
  /** Inter-call gap, varied per cohort so the achievable-ceiling work has cadence to read. */
  readonly gapMinutes: number
}

const model = (config: Omit<ModelConfig, "latencyRange" | "finishReasonStop" | "responseModel" | "scopeName">) => ({
  ...config,
  responseModel: config.model,
  scopeName: `${config.provider}-instrumentation`,
  latencyRange: [600, 2500] as const,
  finishReasonStop: config.provider === "anthropic" ? "end_turn" : "stop",
})

export const CACHE_QA_COHORTS: readonly CacheQaCohort[] = [
  {
    key: "cache-qa-optimal",
    serviceName: "cache-qa-research-agent",
    modelConfig: model({
      provider: "anthropic",
      model: "claude-opus-4-5",
      costInPerMToken: 5,
      costOutPerMToken: 25,
      cacheReadPerMToken: 0.5,
      cacheWritePerMToken: 6.25,
    }),
    calls: 96,
    cacheProfile: { hitRate: 0.62, writeShare: 0.06 },
    promptTokens: 12_000,
    gapMinutes: 90,
  },
  {
    key: "cache-qa-investigate",
    serviceName: "cache-qa-classifier",
    modelConfig: model({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costInPerMToken: 1,
      costOutPerMToken: 5,
      cacheReadPerMToken: 0.1,
      cacheWritePerMToken: 1.25,
    }),
    calls: 140,
    cacheProfile: { hitRate: 0.06, writeShare: 0.3 },
    promptTokens: 9_000,
    gapMinutes: 60,
  },
  {
    key: "cache-qa-cache-it",
    serviceName: "cache-qa-doc-extractor",
    modelConfig: model({
      provider: "openai",
      model: "gpt-5-mini",
      costInPerMToken: 0.25,
      costOutPerMToken: 2,
      cacheReadPerMToken: 0.025,
    }),
    calls: 48,
    cacheProfile: CACHE_OFF,
    promptTokens: 26_000,
    gapMinutes: 180,
  },
  {
    key: "cache-qa-premium-openai",
    serviceName: "cache-qa-planner",
    modelConfig: model({
      provider: "openai",
      model: "gpt-5.6",
      costInPerMToken: 5,
      costOutPerMToken: 30,
      cacheReadPerMToken: 0.5,
      cacheWritePerMToken: 6.25,
    }),
    calls: 64,
    cacheProfile: { hitRate: 0.14, writeShare: 0.22 },
    promptTokens: 15_000,
    gapMinutes: 135,
  },
  {
    key: "cache-qa-no-premium-on",
    serviceName: "cache-qa-router",
    modelConfig: model({
      provider: "openai",
      model: "gpt-5.4-mini",
      costInPerMToken: 0.75,
      costOutPerMToken: 4.5,
      cacheReadPerMToken: 0.075,
    }),
    calls: 110,
    cacheProfile: { hitRate: 0.05, writeShare: 0 },
    promptTokens: 7_000,
    gapMinutes: 75,
  },
  {
    key: "cache-qa-thin",
    serviceName: "cache-qa-tagger",
    modelConfig: model({
      provider: "google",
      model: "gemini-2.5-flash-lite",
      costInPerMToken: 0.1,
      costOutPerMToken: 0.4,
      cacheReadPerMToken: 0.01,
    }),
    calls: 8,
    cacheProfile: { hitRate: 0.4, writeShare: 0.1 },
    promptTokens: 5_000,
    gapMinutes: 720,
  },
]

const formatClickHouseTimestamp = (date: Date): string => date.toISOString().replace("T", " ").replace("Z", "000")

/** The sentinel row: first call of the first cohort, which is also the oldest one written. */
const cacheQaSentinelSpanId = (scope: SeedScope): string =>
  scope.spanHex(CACHE_QA_COHORTS[0]?.key ?? "cache-qa-optimal", 0)

const buildCohortSpans = (cohort: CacheQaCohort, scope: SeedScope, nowMs: number): SpanRow[] => {
  const spans: SpanRow[] = []
  for (let call = 0; call < cohort.calls; call++) {
    // Newest call first, walking backwards at the cohort's own cadence.
    const start = new Date(nowMs - (cohort.calls - 1 - call) * cohort.gapMinutes * MINUTE_MS)
    const traceId = scope.traceHex(cohort.key, call)
    const ctx: TraceContext = {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      apiKeyId: scope.apiKeyId,
      simulationId: "",
      startTime: start,
      sessionId: scope.traceHex(`${cohort.key}:session`, Math.floor(call / CALLS_PER_SESSION)),
      userId: "",
      userEmail: "",
      serviceName: cohort.serviceName,
      tags: ["cache-qa", cohort.key],
      metadata: {},
    }

    const span = makeLlmSpan({
      base: toBase(ctx, traceId, "", start, 2_400),
      modelConfig: cohort.modelConfig,
      inputMessages: [userMessage(`Cache QA request ${call} for ${cohort.key}`)],
      outputMessages: [assistantTextMessage(`Cache QA response ${call}`)],
      systemInstructions: "You are a cache-economics QA fixture agent.",
      finishReason: cohort.modelConfig.finishReasonStop,
      promptTokens: cohort.promptTokens,
      cacheProfile: cohort.cacheProfile,
    })
    // The builder assigns a random span id; the sentinel needs a stable one.
    span.span_id = scope.spanHex(cohort.key, call)
    spans.push(span)
  }
  return spans
}

/**
 * The full fixture. Pure — the seeder inserts it and the tests read the same rows
 * back through the classifier, so what ships is what was asserted.
 */
export const buildCacheEconomicsQaFixture = (scope: SeedScope, nowMs: number): SpanRow[] =>
  CACHE_QA_COHORTS.flatMap((cohort) => buildCohortSpans(cohort, scope, nowMs))

/**
 * Bootstrap-only QA fixture for the cost section's cache panel. Kept out of
 * `allSeeders` so it never runs during runtime demo-project creation.
 */
export const cacheEconomicsQaSeeder: Seeder = {
  name: "spans/cache-economics-qa",
  run: (ctx) =>
    Effect.gen(function* () {
      const nowMs = Date.now()
      // Recency-aware: a fixture seeded longer ago than its own window has drifted
      // out of the page's default range, so reseed rather than skip.
      const freshFixturePresent = yield* isSentinelPresent(
        ctx.client,
        "spans",
        "span_id = {spanId:String} AND start_time >= {since:DateTime64(9, 'UTC')}",
        {
          spanId: cacheQaSentinelSpanId(ctx.scope),
          since: formatClickHouseTimestamp(new Date(nowMs - CACHE_QA_WINDOW_DAYS * DAY_MS)),
        },
      )
      if (freshFixturePresent) {
        if (!ctx.quiet) console.log("  -> spans/cache-economics-qa: already seeded (fresh), skipping")
        return
      }

      const spans = buildCacheEconomicsQaFixture(ctx.scope, nowMs)
      yield* insertJsonEachRow(ctx.client, "spans", spans)
      if (!ctx.quiet) {
        console.log(`  -> spans/cache-economics-qa: ${spans.length} calls across ${CACHE_QA_COHORTS.length} cohorts`)
      }
    }),
}
