import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import type { CacheCadenceRow, CostAnalyticsRepositoryShape } from "@domain/spans"
import { CACHE_CEILING_LIFETIME_SECONDS, CostAnalyticsRepository } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { CostAnalyticsRepositoryLive } from "./cost-analytics-repository.ts"

const ORG_ID = OrganizationId("o".repeat(24))
// Own project so fixtures from other suites can't leak into the aggregates.
const PROJECT_ID = ProjectId("costanalytics00000000000")
// Separate projects so the overview's exact totals stay readable while the
// breakdown and model-usage fixtures grow their own shapes.
const BREAKDOWN_PROJECT_ID = ProjectId("costbreakdown00000000000")
const MODEL_USAGE_PROJECT_ID = ProjectId("costmodelusage0000000000")
const CACHE_PROJECT_ID = ProjectId("costcache00000000000000a")
// Cadence lives on its own project: the ceiling is read from inter-call gaps, so it
// needs timestamps chosen for their spacing rather than for the token columns.
const CADENCE_PROJECT_ID = ProjectId("costcadence000000000000a")

const DAY1 = new Date("2026-06-01T10:00:00.000Z")
const DAY2 = new Date("2026-06-02T10:00:00.000Z")
const FROM = new Date("2026-06-01T00:00:00.000Z")
const TO = new Date("2026-06-03T00:00:00.000Z")
const DAY_SECONDS = 24 * 60 * 60

const toCh = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")
const traceId = (n: number) => `ca${n}`.padEnd(32, "0")
const spanId = (n: number) => `ca${n}`.padEnd(16, "0")

// Widened past `CostSource` so a fixture can store the empty string a row written
// before the column carries — the state `parseCostSource` has to reclassify.
type CostSpanRow = Omit<SpanRow, "cost_source"> & { cost_source: string }

type SpanOpts = {
  project?: ProjectId
  trace?: number
  operation?: string
  model?: string
  provider?: string
  serviceName?: string
  costTotal?: number
  costInput?: number
  costOutput?: number
  isEstimated?: boolean
  tokensInput?: number
  tokensCacheRead?: number
  tokensCacheCreate?: number
  costSource?: string
  session?: string
  agentName?: string
}

const span = (n: number, startTime: Date, opts: SpanOpts = {}): CostSpanRow =>
  ({
    organization_id: ORG_ID,
    project_id: opts.project ?? PROJECT_ID,
    session_id: opts.session ?? "",
    user_id: "",
    trace_id: traceId(opts.trace ?? n),
    span_id: spanId(n),
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toCh(startTime),
    end_time: toCh(new Date(startTime.getTime() + 1_000)),
    name: "ca-span",
    service_name: opts.serviceName ?? "ca-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: opts.operation ?? "chat",
    provider: opts.provider ?? "openai",
    model: opts.model ?? "gpt-4o",
    agent_name: opts.agentName ?? "",
    response_model: "",
    tokens_input: opts.tokensInput ?? 0,
    tokens_output: 0,
    tokens_cache_read: opts.tokensCacheRead ?? 0,
    tokens_cache_create: opts.tokensCacheCreate ?? 0,
    tokens_reasoning: 0,
    cost_input_microcents: opts.costInput ?? 0,
    cost_output_microcents: opts.costOutput ?? 0,
    cost_total_microcents: opts.costTotal ?? 0,
    cost_is_estimated: opts.isEstimated ? 1 : 0,
    cost_source: opts.costSource ?? "",
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
  }) satisfies CostSpanRow

const ch = setupTestClickHouse({ truncateBetweenTests: false })

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

const scope = { organizationId: ORG_ID, projectId: PROJECT_ID, from: FROM, to: TO }
const breakdownScope = { ...scope, projectId: BREAKDOWN_PROJECT_ID }
const modelUsageScope = { ...scope, projectId: MODEL_USAGE_PROJECT_ID }
const cacheScope = { ...scope, projectId: CACHE_PROJECT_ID }
const cadenceScope = { ...scope, projectId: CADENCE_PROJECT_ID }

const cacheSpan = (n: number, startTime: Date, opts: Omit<SpanOpts, "project">): CostSpanRow =>
  span(n, startTime, { ...opts, project: CACHE_PROJECT_ID })

// Leaves room inside `TO` for the longest offset the cadence fixture uses.
const CADENCE_BASE = new Date("2026-06-02T12:00:00.000Z")
const at = (seconds: number): Date => new Date(CADENCE_BASE.getTime() + seconds * 1_000)

const cadenceSpan = (n: number, seconds: number, opts: Omit<SpanOpts, "project">): CostSpanRow =>
  span(n, at(seconds), { ...opts, project: CADENCE_PROJECT_ID, tokensInput: opts.tokensInput ?? 1_000 })

const cadenceFor = (cadence: readonly CacheCadenceRow[], model: string) => cadence.find((row) => row.model === model)

/** Warm volume at one lifetime, read out of the cumulative histogram. */
const warmAt = (cadence: readonly CacheCadenceRow[], model: string, lifetimeSeconds: number) =>
  cadenceFor(cadence, model)?.warmTokensByLifetime[lifetimeSeconds]

const warmCallsAt = (cadence: readonly CacheCadenceRow[], model: string, lifetimeSeconds: number) =>
  cadenceFor(cadence, model)?.warmCallsByLifetime[lifetimeSeconds]

const breakdownSpan = (n: number, startTime: Date, opts: Omit<SpanOpts, "project">): CostSpanRow =>
  span(n, startTime, { ...opts, project: BREAKDOWN_PROJECT_ID })

// Seven models whose spend order is the exact reverse of their token order, so a
// ranking that used volume instead of spend would be visible in the assertions.
const MODEL_USAGE_MODELS = [
  { model: "mu1", costTotal: 700, tokensInput: 10 },
  { model: "mu2", costTotal: 600, tokensInput: 20 },
  { model: "mu3", costTotal: 500, tokensInput: 30 },
  { model: "mu4", costTotal: 400, tokensInput: 40 },
  { model: "mu5", costTotal: 300, tokensInput: 50 },
  { model: "mu6", costTotal: 200, tokensInput: 60 },
  { model: "mu7", costTotal: 100, tokensInput: 70 },
] as const

describe("CostAnalyticsRepositoryLive", () => {
  let repo: CostAnalyticsRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* CostAnalyticsRepository
      }).pipe(Effect.provide(CostAnalyticsRepositoryLive)),
    )
  })

  // Every test only reads, so the fixture is seeded once for the file.
  beforeAll(async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        // Trace 1: two billable spans, plus a tool span that must not count.
        span(1, DAY1, { trace: 1, costTotal: 300, isEstimated: true, costSource: "estimated" }),
        span(2, DAY1, { trace: 1, costTotal: 100, isEstimated: true, costSource: "estimated", model: "gpt-4o-mini" }),
        span(3, DAY1, { trace: 1, operation: "execute_tool", costTotal: 9_999 }),
        // Trace 2: cost the provider reported.
        span(4, DAY2, { trace: 2, costTotal: 200, costSource: "provider_reported" }),
        // Trace 3: ingestion could not price the model, so the total understates spend.
        span(5, DAY2, {
          trace: 3,
          costSource: "unpriced",
          tokensInput: 500,
          model: "mystery-1",
          provider: "acme",
        }),
        // Trace 4: tool spans only — must never reach a denominator.
        span(6, DAY2, { trace: 4, operation: "execute_tool", costTotal: 7_777 }),
        // Trace 5: stored before `cost_source` existed, so its zero is ambiguous.
        span(7, DAY2, { trace: 5, costSource: "", tokensInput: 300, model: "legacy-1", provider: "acme" }),
        // Trace 6: priced at zero — genuinely free, and must not read as a gap.
        span(8, DAY2, { trace: 6, costSource: "estimated", tokensInput: 100, model: "freebie-1", provider: "acme" }),

        // Breakdown fixture: gpt-4o spans both traces, gpt-4o-mini only one, so a
        // per-dimension average divided by every trace would read differently.
        breakdownSpan(11, DAY1, {
          trace: 11,
          model: "gpt-4o",
          serviceName: "api",
          costTotal: 1_000,
          costInput: 700,
          costOutput: 200,
          costSource: "estimated",
        }),
        breakdownSpan(12, DAY1, {
          trace: 11,
          model: "gpt-4o-mini",
          serviceName: "api",
          costTotal: 200,
          costInput: 150,
          costOutput: 50,
          costSource: "estimated",
        }),
        breakdownSpan(13, DAY2, {
          trace: 12,
          model: "gpt-4o",
          serviceName: "worker",
          costTotal: 500,
          costInput: 300,
          costOutput: 100,
          costSource: "estimated",
        }),
        breakdownSpan(14, DAY2, {
          trace: 12,
          model: "mystery-1",
          provider: "acme",
          operation: "embeddings",
          serviceName: "worker",
          costSource: "unpriced",
          tokensInput: 400,
        }),
        breakdownSpan(15, DAY2, { trace: 12, operation: "execute_tool", serviceName: "worker", costTotal: 9_999 }),

        ...MODEL_USAGE_MODELS.map((entry, index) =>
          span(21 + index, DAY1, {
            project: MODEL_USAGE_PROJECT_ID,
            trace: 21,
            model: entry.model,
            costTotal: entry.costTotal,
            costSource: "estimated",
            tokensInput: entry.tokensInput,
          }),
        ),
        span(28, DAY2, {
          project: MODEL_USAGE_PROJECT_ID,
          trace: 22,
          model: "mu1",
          costTotal: 50,
          costSource: "estimated",
          tokensInput: 5,
        }),

        // Cache fixture: one model caching, one not, plus an unpriced model and a
        // tool span that must stay out of every cache figure.
        cacheSpan(31, DAY1, {
          trace: 31,
          model: "cached-1",
          costTotal: 400,
          costSource: "estimated",
          tokensInput: 100,
          tokensCacheRead: 300,
          tokensCacheCreate: 100,
        }),
        cacheSpan(32, DAY2, {
          trace: 31,
          model: "cached-1",
          costTotal: 200,
          costSource: "estimated",
          tokensInput: 100,
          tokensCacheRead: 100,
          tokensCacheCreate: 0,
        }),
        cacheSpan(33, DAY1, {
          trace: 32,
          model: "uncached-1",
          costTotal: 900,
          costSource: "estimated",
          tokensInput: 500,
        }),
        cacheSpan(34, DAY2, {
          trace: 32,
          model: "mystery-1",
          provider: "acme",
          costSource: "unpriced",
          tokensInput: 700,
        }),
        cacheSpan(35, DAY2, {
          trace: 32,
          operation: "execute_tool",
          model: "cached-1",
          costTotal: 9_999,
          tokensInput: 9_999,
          tokensCacheRead: 9_999,
        }),

        // Cadence fixture. Every call carries 1,000 cacheable tokens, so a warm-token
        // figure reads directly as a call count.

        // Six calls one minute apart on one agent, each in a session of its own. The
        // ceiling is defined over the agent's whole traffic, so five of the six arrive
        // warm; an implementation measuring within-session gaps reads zero here, and
        // this is the only row in the suite that can tell the two apart.
        ...[0, 60, 120, 180, 240, 300].map((seconds, index) =>
          cadenceSpan(40 + index, seconds, {
            model: "single-turn",
            serviceName: "solo-agent",
            session: `solo-session-${index}`,
          }),
        ),
        // Fiftieth minute: past the five-minute lifetime, inside the hour one. Breaks
        // the chain for the shorter threshold and stays warm for the longer one.
        cadenceSpan(46, 3_000, { model: "single-turn", serviceName: "solo-agent", session: "solo-session-6" }),

        // Two agents alternating on one model, 300s apart when interleaved but 600s
        // apart within either agent. Nothing is warm: an agent cannot read a prefix
        // another agent wrote. Partitioning by model alone would report three warm calls.
        cadenceSpan(50, 0, { model: "shared-model", serviceName: "agent-a" }),
        cadenceSpan(51, 300, { model: "shared-model", serviceName: "agent-b" }),
        cadenceSpan(52, 600, { model: "shared-model", serviceName: "agent-a" }),
        cadenceSpan(53, 900, { model: "shared-model", serviceName: "agent-b" }),

        // One service, two agent names a minute apart: `agent_name` is the prompt-owning
        // unit when it is set, so neither call is warm.
        cadenceSpan(54, 0, { model: "named-agents", serviceName: "shared-service", agentName: "billing" }),
        cadenceSpan(55, 60, { model: "named-agents", serviceName: "shared-service", agentName: "support" }),
      ]),
    )
  })

  describe("getCostOverview", () => {
    it("sums only billable spans", async () => {
      const overview = await runCh(repo.getCostOverview(scope))

      expect(overview.totalMicrocents).toBe(600)
    })

    it("counts only traces with billable usage in the per-trace denominator", async () => {
      const overview = await runCh(repo.getCostOverview(scope))

      // Traces 1, 2, 3, 5, 6 — the tool-only trace 4 is excluded.
      expect(overview.tracesWithUsage).toBe(5)
      expect(overview.avgPerTraceMicrocents).toBe(120)
    })

    it("splits provider-reported from estimated spend by cost source", async () => {
      const { confidence } = await runCh(repo.getCostOverview(scope))

      expect(confidence.verifiedMicrocents).toBe(200)
      expect(confidence.estimatedMicrocents).toBe(400)
      expect(confidence.billableTokens).toBe(900)
    })

    it("counts what ingestion recorded as unpriced, and nothing else", async () => {
      const { confidence } = await runCh(repo.getCostOverview(scope))

      expect(confidence.unpricedTokens).toBe(500)
      expect(confidence.unpricedCalls).toBe(1)
    })

    it("keeps pre-cost-source zeros in their own bucket", async () => {
      const { confidence } = await runCh(repo.getCostOverview(scope))

      expect(confidence.unknownTokens).toBe(300)
      expect(confidence.unknownCalls).toBe(1)
    })

    it("lists both zero-cost buckets but never a model priced at zero", async () => {
      const { confidence } = await runCh(repo.getCostOverview(scope))

      expect(confidence.zeroCostPairs).toEqual([
        { provider: "acme", model: "mystery-1", tokens: 500, calls: 1, source: "unpriced" },
        { provider: "acme", model: "legacy-1", tokens: 300, calls: 1, source: "unknown" },
      ])
    })

    it("reads the top spend model by total spend", async () => {
      const overview = await runCh(repo.getCostOverview(scope))

      expect(overview.topSpendModel).toEqual({ model: "gpt-4o", provider: "openai", costMicrocents: 500 })
    })
  })

  describe("getCostSeries", () => {
    it("buckets total spend per UTC day and splits it by model", async () => {
      const buckets = await runCh(repo.getCostSeries({ ...scope, metric: "total", bucketSeconds: DAY_SECONDS }))

      expect(buckets.map((bucket) => bucket.bucketStart.toISOString())).toEqual([
        "2026-06-01T00:00:00.000Z",
        "2026-06-02T00:00:00.000Z",
      ])
      expect(buckets.map((bucket) => bucket.valueMicrocents)).toEqual([400, 200])
      expect(buckets[0]?.byModel).toEqual([
        { model: "gpt-4o", costMicrocents: 300 },
        { model: "gpt-4o-mini", costMicrocents: 100 },
      ])
    })

    it("leaves models that spent nothing in the bucket out of the stack", async () => {
      const buckets = await runCh(repo.getCostSeries({ ...scope, metric: "total", bucketSeconds: DAY_SECONDS }))

      // Day 2 carries three zero-cost models beside the one that spent.
      expect(buckets[1]?.byModel).toEqual([{ model: "gpt-4o", costMicrocents: 200 }])
    })

    it("summarises per-trace cost for the non-additive metrics", async () => {
      const buckets = await runCh(repo.getCostSeries({ ...scope, metric: "average", bucketSeconds: DAY_SECONDS }))

      // Day 1 holds one trace worth 400; day 2 holds a 200 trace and three at 0.
      expect(buckets.map((bucket) => bucket.valueMicrocents)).toEqual([400, 50])
      expect(buckets.every((bucket) => bucket.byModel.length === 0)).toBe(true)
    })
  })

  describe("getCostBreakdown", () => {
    it("orders rows by spend and excludes non-billable operations", async () => {
      const { rows } = await runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "model" }))

      expect(rows.map((row) => row.key)).toEqual(["gpt-4o", "gpt-4o-mini", "mystery-1"])
      expect(rows.map((row) => row.totalMicrocents)).toEqual([1_500, 200, 0])
    })

    it("closes each row with a cache-and-other remainder", async () => {
      const { rows } = await runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "model" }))

      const gpt4o = rows[0]
      expect(gpt4o?.inputMicrocents).toBe(1_000)
      expect(gpt4o?.outputMicrocents).toBe(300)
      expect(gpt4o?.cacheAndOtherMicrocents).toBe(200)
      expect(
        rows.every(
          (row) => row.inputMicrocents + row.outputMicrocents + row.cacheAndOtherMicrocents === row.totalMicrocents,
        ),
      ).toBe(true)
    })

    it("divides a row by the traces containing that value, not by every trace", async () => {
      const { rows, totals } = await runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "model" }))

      // gpt-4o-mini appears in one of the two traces: 200/1, never 200/2.
      const mini = rows.find((row) => row.key === "gpt-4o-mini")
      expect(mini?.tracesWithValue).toBe(1)
      expect(mini?.avgPerTraceMicrocents).toBe(200)
      expect(rows[0]?.tracesWithValue).toBe(2)
      expect(rows[0]?.avgPerTraceMicrocents).toBe(750)
      expect(totals.tracesWithUsage).toBe(2)
    })

    it("reports unpriced usage on the row whose total it understates", async () => {
      const { rows } = await runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "model" }))

      const mystery = rows.find((row) => row.key === "mystery-1")
      expect(mystery?.unpricedTokens).toBe(400)
      expect(mystery?.unpricedCalls).toBe(1)
      expect(rows[0]?.unpricedCalls).toBe(0)
    })

    it("totals the window rather than the returned rows", async () => {
      const { totals } = await runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "model" }))

      expect(totals.totalMicrocents).toBe(1_700)
      expect(totals.calls).toBe(4)
      expect(totals.avgPerCallMicrocents).toBe(425)
      expect(totals.distinctValues).toBe(3)
    })

    it("guards every divisor on a window with no billable usage", async () => {
      // Nothing seeded in this project, so both averages divide by zero.
      const empty = { ...breakdownScope, projectId: ProjectId("costbreakdownempty000000") }

      const { rows, totals } = await runCh(repo.getCostBreakdown({ ...empty, dimension: "model" }))

      expect(rows).toEqual([])
      expect(totals.totalMicrocents).toBe(0)
      expect(totals.calls).toBe(0)
      expect(totals.distinctValues).toBe(0)
      expect(totals.avgPerCallMicrocents).toBe(0)
      expect(totals.tracesWithUsage).toBe(0)
      expect(totals.cacheAndOtherMicrocents).toBe(0)
    })

    it("groups by provider, operation, and service from the same measures", async () => {
      const [byProvider, byOperation, byService] = await Promise.all([
        runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "provider" })),
        runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "operation" })),
        runCh(repo.getCostBreakdown({ ...breakdownScope, dimension: "service" })),
      ])

      expect(byProvider.rows.map((row) => [row.key, row.totalMicrocents])).toEqual([
        ["openai", 1_700],
        ["acme", 0],
      ])
      expect(byOperation.rows.map((row) => [row.key, row.totalMicrocents])).toEqual([
        ["chat", 1_700],
        ["embeddings", 0],
      ])
      expect(byService.rows.map((row) => [row.key, row.totalMicrocents])).toEqual([
        ["api", 1_200],
        ["worker", 500],
      ])
    })
  })

  describe("getModelUsageSeries", () => {
    it("ranks the charted models by spend, not by token volume", async () => {
      const series = await runCh(repo.getModelUsageSeries({ ...modelUsageScope, bucketSeconds: DAY_SECONDS }))

      expect(series.models).toEqual(["mu1", "mu2", "mu3", "mu4", "mu5", "mu6"])
      // mu7 carries the most tokens of any model and is still the one collapsed.
      expect(series.otherModels).toBe(1)
    })

    it("collapses the models outside the ranks into each bucket's other slice", async () => {
      const series = await runCh(repo.getModelUsageSeries({ ...modelUsageScope, bucketSeconds: DAY_SECONDS }))

      expect(series.buckets[0]?.other).toEqual({ costMicrocents: 100, tokens: 70 })
      expect(series.buckets[1]?.other).toEqual({ costMicrocents: 0, tokens: 0 })
    })

    it("carries cost and tokens per model per UTC day from one query", async () => {
      const series = await runCh(repo.getModelUsageSeries({ ...modelUsageScope, bucketSeconds: DAY_SECONDS }))

      expect(series.buckets.map((bucket) => bucket.bucketStart.toISOString())).toEqual([
        "2026-06-01T00:00:00.000Z",
        "2026-06-02T00:00:00.000Z",
      ])
      expect(series.buckets[0]?.byModel).toContainEqual({ model: "mu1", costMicrocents: 700, tokens: 10 })
      expect(series.buckets[1]?.byModel).toEqual([{ model: "mu1", costMicrocents: 50, tokens: 5 }])
    })
  })

  describe("getCacheEconomics", () => {
    it("splits cache token flow per provider/model pair, ranked by spend", async () => {
      const economics = await runCh(repo.getCacheEconomics(cacheScope))

      expect(economics.rows.map((row) => `${row.provider}/${row.model}`)).toEqual([
        "openai/uncached-1",
        "openai/cached-1",
        "acme/mystery-1",
      ])
      expect(economics.rows[1]).toMatchObject({
        model: "cached-1",
        calls: 2,
        inputTokens: 200,
        cacheReadTokens: 400,
        cacheCreateTokens: 100,
        costMicrocents: 600,
      })
    })

    it("keeps tool spans out of every cache figure", async () => {
      const economics = await runCh(repo.getCacheEconomics(cacheScope))

      // The excluded tool span carries 9,999 cache reads on `cached-1`.
      expect(economics.rows.find((row) => row.model === "cached-1")?.cacheReadTokens).toBe(400)
      expect(economics.totals.calls).toBe(4)
    })

    it("reports a caching-off model as zero cache tokens rather than omitting it", async () => {
      const economics = await runCh(repo.getCacheEconomics(cacheScope))

      expect(economics.rows.find((row) => row.model === "uncached-1")).toMatchObject({
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        inputTokens: 500,
      })
    })

    it("carries the unpriced caveat so a row's spend is never read as complete", async () => {
      const economics = await runCh(repo.getCacheEconomics(cacheScope))

      expect(economics.rows.find((row) => row.model === "mystery-1")).toMatchObject({
        unpricedCalls: 1,
        unpricedTokens: 700,
        costMicrocents: 0,
      })
      expect(economics.totals).toMatchObject({ distinctModels: 3, unpricedCalls: 1, costMicrocents: 1_500 })
    })
  })

  describe("getCacheEconomics cadence", () => {
    it("measures gaps across the agent's whole traffic, not within each session", async () => {
      const { cadence } = await runCh(repo.getCacheEconomics(cadenceScope))

      // Six single-turn calls in six distinct sessions, five of them warm.
      expect(cadenceFor(cadence, "single-turn")).toMatchObject({ calls: 7, cacheableTokens: 7_000 })
      expect(warmCallsAt(cadence, "single-turn", 300)).toBe(5)
      expect(warmAt(cadence, "single-turn", 300)).toBe(5_000)
    })

    it("treats a gap longer than the lifetime as a fresh miss, per bucket", async () => {
      const { cadence } = await runCh(repo.getCacheEconomics(cadenceScope))

      // The 50-minute gap is a miss at five minutes and a hit at an hour.
      expect(warmCallsAt(cadence, "single-turn", 300)).toBe(5)
      expect(warmCallsAt(cadence, "single-turn", 3_600)).toBe(6)
    })

    it("returns cumulative buckets, so a longer lifetime never loses a shorter one's volume", async () => {
      const { cadence } = await runCh(repo.getCacheEconomics(cadenceScope))
      const row = cadenceFor(cadence, "single-turn")
      const lifetimes = [...CACHE_CEILING_LIFETIME_SECONDS]

      expect(
        Object.keys(row?.warmTokensByLifetime ?? {})
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual(lifetimes)
      const warm = lifetimes.map((s) => row?.warmTokensByLifetime[s] ?? 0)
      expect(warm).toEqual([...warm].sort((a, b) => a - b))
      expect(Math.max(...warm)).toBeLessThanOrEqual(row?.cacheableTokens ?? 0)
    })

    it("never lets one agent warm another agent's prefix on a shared model", async () => {
      const { cadence } = await runCh(repo.getCacheEconomics(cadenceScope))

      expect(cadenceFor(cadence, "shared-model")).toMatchObject({ calls: 4 })
      // Interleaved they are 300s apart; within either agent they are 600s apart.
      expect(warmCallsAt(cadence, "shared-model", 300)).toBe(0)
      expect(warmAt(cadence, "shared-model", 300)).toBe(0)
    })

    it("splits on agent_name when it is set, rather than on the service that hosts it", async () => {
      const { cadence } = await runCh(repo.getCacheEconomics(cadenceScope))

      expect(cadenceFor(cadence, "named-agents")).toMatchObject({ calls: 2 })
      expect(warmCallsAt(cadence, "named-agents", 300)).toBe(0)
    })

    it("returns one row per pair rather than one per pair per lifetime", async () => {
      const { cadence } = await runCh(repo.getCacheEconomics(cadenceScope))

      expect(cadence.filter((row) => row.model === "single-turn")).toHaveLength(1)
    })
  })
})
