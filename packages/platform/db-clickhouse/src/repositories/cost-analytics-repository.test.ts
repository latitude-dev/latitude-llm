import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { CostAnalyticsRepository, type CostAnalyticsRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { CostAnalyticsRepositoryLive } from "./cost-analytics-repository.ts"

const ORG_ID = OrganizationId("o".repeat(24))
// Own project so fixtures from other suites can't leak into the aggregates.
const PROJECT_ID = ProjectId("costanalytics00000000000")

const DAY1 = new Date("2026-06-01T10:00:00.000Z")
const DAY2 = new Date("2026-06-02T10:00:00.000Z")
const FROM = new Date("2026-06-01T00:00:00.000Z")
const TO = new Date("2026-06-03T00:00:00.000Z")
const DAY_SECONDS = 24 * 60 * 60

const toCh = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")
const traceId = (n: number) => `ca${n}`.padEnd(32, "0")
const spanId = (n: number) => `ca${n}`.padEnd(16, "0")

const span = (
  n: number,
  startTime: Date,
  opts: {
    trace?: number
    operation?: string
    model?: string
    provider?: string
    costTotal?: number
    isEstimated?: boolean
    tokensInput?: number
  } = {},
): SpanRow =>
  ({
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    session_id: "",
    user_id: "",
    trace_id: traceId(opts.trace ?? n),
    span_id: spanId(n),
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toCh(startTime),
    end_time: toCh(new Date(startTime.getTime() + 1_000)),
    name: "ca-span",
    service_name: "ca-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: opts.operation ?? "chat",
    provider: opts.provider ?? "openai",
    model: opts.model ?? "gpt-4o",
    agent_name: "",
    response_model: "",
    tokens_input: opts.tokensInput ?? 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: opts.costTotal ?? 0,
    cost_is_estimated: opts.isEstimated ? 1 : 0,
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
  }) satisfies SpanRow

const ch = setupTestClickHouse()

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

const scope = { organizationId: ORG_ID, projectId: PROJECT_ID, from: FROM, to: TO }

describe("CostAnalyticsRepositoryLive", () => {
  let repo: CostAnalyticsRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* CostAnalyticsRepository
      }).pipe(Effect.provide(CostAnalyticsRepositoryLive)),
    )
  })

  beforeEach(async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        // Trace 1: two billable spans, plus a tool span that must not count.
        span(1, DAY1, { trace: 1, costTotal: 300, isEstimated: true }),
        span(2, DAY1, { trace: 1, costTotal: 100, isEstimated: true, model: "gpt-4o-mini" }),
        span(3, DAY1, { trace: 1, operation: "execute_tool", costTotal: 9_999 }),
        // Trace 2: provider-reported cost.
        span(4, DAY2, { trace: 2, costTotal: 200, isEstimated: false }),
        // Trace 3: tokens but no cost — an unpriced candidate.
        span(5, DAY2, { trace: 3, costTotal: 0, tokensInput: 500, model: "mystery-1", provider: "acme" }),
        // Trace 4: tool spans only — must never reach a denominator.
        span(6, DAY2, { trace: 4, operation: "execute_tool", costTotal: 7_777 }),
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

      expect(overview.tracesWithUsage).toBe(3)
      expect(overview.avgPerTraceMicrocents).toBe(200)
    })

    it("splits provider-reported from estimated spend", async () => {
      const { confidence } = await runCh(repo.getCostOverview(scope))

      expect(confidence.verifiedMicrocents).toBe(200)
      expect(confidence.estimatedMicrocents).toBe(400)
      expect(confidence.billableTokens).toBe(500)
    })

    it("reports zero-cost usage as candidate pairs", async () => {
      const { confidence } = await runCh(repo.getCostOverview(scope))

      expect(confidence.unpricedCandidateTokens).toBe(500)
      expect(confidence.unpricedCandidateTraces).toBe(1)
      expect(confidence.unpricedCandidatePairs).toEqual([
        { provider: "acme", model: "mystery-1", tokens: 500, calls: 1 },
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

    it("summarises per-trace cost for the non-additive metrics", async () => {
      const buckets = await runCh(repo.getCostSeries({ ...scope, metric: "average", bucketSeconds: DAY_SECONDS }))

      // Day 1 holds one trace worth 400; day 2 holds a 200 trace and a 0 trace.
      expect(buckets.map((bucket) => bucket.valueMicrocents)).toEqual([400, 100])
      expect(buckets.every((bucket) => bucket.byModel.length === 0)).toBe(true)
    })
  })
})
