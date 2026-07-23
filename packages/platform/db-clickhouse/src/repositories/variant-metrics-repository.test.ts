import { type ResolvedRange, VariantMetricsReader, type VariantMetricsReaderShape } from "@domain/experiments"
import type { ChSqlClient } from "@domain/shared"
import { OrganizationId, ProjectId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { VariantMetricsReaderLive } from "./variant-metrics-repository.ts"

const ORG = OrganizationId("oooooooooooooooooooooooo")
const PROJ = ProjectId("pppppppppppppppppppppppp")
const dt = (v: Date) => v.toISOString().replace("T", " ").replace("Z", "")

const START = new Date(Date.UTC(2026, 2, 15, 12, 0, 0))
const RANGE: ResolvedRange = {
  fromIso: new Date(Date.UTC(2026, 2, 1, 0, 0, 0)).toISOString(),
  toIso: new Date(Date.UTC(2026, 3, 1, 0, 0, 0)).toISOString(),
}
const EMPTY_RANGE: ResolvedRange = {
  fromIso: new Date(Date.UTC(2020, 0, 1)).toISOString(),
  toIso: new Date(Date.UTC(2020, 1, 1)).toISOString(),
}

const ch = setupTestClickHouse()

const makeSpan = (o: {
  sessionId: string
  traceId: string
  spanId: string
  userId?: string
  operation?: string
  toolName?: string
  cost?: number
  offsetMs?: number
}): SpanRow => {
  const start = new Date(START.getTime() + (o.offsetMs ?? 0))
  return {
    organization_id: ORG as string,
    project_id: PROJ as string,
    session_id: o.sessionId,
    user_id: o.userId ?? "",
    trace_id: o.traceId,
    span_id: o.spanId,
    parent_span_id: "",
    api_key_id: "k",
    simulation_id: "",
    start_time: dt(start),
    end_time: dt(new Date(start.getTime() + 1000)),
    name: "root",
    service_name: "svc",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: o.operation ?? "chat",
    provider: "",
    model: "",
    agent_name: "",
    response_model: "",
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: o.cost ?? 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: o.toolName ?? "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
  }
}

const makeScore = (o: { sessionId: string; traceId: string; signalId: string; id: string }) => ({
  id: o.id,
  organization_id: ORG as string,
  project_id: PROJ as string,
  session_id: o.sessionId,
  trace_id: o.traceId,
  span_id: "",
  source: "monitor",
  source_id: "src_000000000000",
  annotator_id: "",
  simulation_id: "",
  issue_id: "",
  value: 1,
  passed: false,
  errored: false,
  duration: 0,
  tokens: 0,
  cost: 0,
  created_at: dt(START),
  signal_id: o.signalId,
})

const makeObservation = (o: { sessionId: string; clusterId: string; observationId: string }) => ({
  organization_id: ORG as string,
  project_id: PROJ as string,
  observation_id: o.observationId,
  session_id: o.sessionId,
  analysis_hash: "a".repeat(64),
  moment_id: "m1",
  projection_method: "umap",
  projection_hash: "b".repeat(64),
  projection_metadata: "{}",
  embedding: [] as number[],
  assigned_cluster_id: o.clusterId,
  assignment_confidence: 0.9,
  assignment_method: "auto",
  reassignment_run_id: "",
  start_time: dt(START),
  end_time: dt(new Date(START.getTime() + 1000)),
  retention_days: 90,
})

const makeMoment = (o: { sessionId: string; traceId: string; momentId: string }) => ({
  organization_id: ORG as string,
  project_id: PROJ as string,
  session_id: o.sessionId,
  analysis_hash: "c".repeat(64),
  moment_id: o.momentId,
  trace_id: o.traceId,
  start_time: dt(START),
  end_time: dt(new Date(START.getTime() + 1000)),
  first_message_index: 0,
  last_message_index: 1,
  boundary_reason: "topic-change",
  embedding: [] as number[],
  coherence_score: 0.5,
  retention_days: 90,
})

const insert = (table: string, values: unknown[]) => ch.client.insert({ table, values, format: "JSONEachRow" })

/** Two sessions in-window: s1 (user u1, a tool call, a signal, an observation, a moment), s2 (user u2). */
const seed = async () => {
  const tA = "a".repeat(32)
  const tB = "b".repeat(32)
  await insert("spans", [
    makeSpan({ sessionId: "s1", traceId: tA, spanId: "1".repeat(16), userId: "u1", cost: 100 }),
    makeSpan({
      sessionId: "s1",
      traceId: tA,
      spanId: "2".repeat(16),
      userId: "u1",
      operation: "execute_tool",
      toolName: "search",
      offsetMs: 10,
    }),
    makeSpan({ sessionId: "s2", traceId: tB, spanId: "3".repeat(16), userId: "u2", cost: 300 }),
  ])
  await insert("scores", [
    makeScore({ sessionId: "s1", traceId: tA, signalId: "sig000000000000000001", id: "1".repeat(24) }),
    makeScore({ sessionId: "s1", traceId: tA, signalId: "sig000000000000000001", id: "2".repeat(24) }),
  ])
  await insert("taxonomy_observations", [
    makeObservation({ sessionId: "s1", clusterId: "cluster_1", observationId: "obs1" }),
  ])
  await insert("session_semantic_moments", [makeMoment({ sessionId: "s1", traceId: tA, momentId: "m1" })])
}

const run = <A, E>(f: (reader: VariantMetricsReaderShape) => Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const reader = yield* VariantMetricsReader
      return yield* f(reader)
    }).pipe(withClickHouse(VariantMetricsReaderLive, ch.client, ORG)),
  )

describe("VariantMetricsReader (chdb)", () => {
  beforeEach(seed)

  it("computes population-scoped metrics via the server-side subquery", async () => {
    const metrics = await run((reader) =>
      reader.computeVariantMetrics({ organizationId: ORG, projectId: PROJ, filterSet: {}, query: null, range: RANGE }),
    )

    expect(metrics.values["sessions.count"]).toBe(2)
    expect(metrics.values["sessions.users"]).toBe(2)
    expect(metrics.values["sessions.cost_total"]).toBeCloseTo(400 / 100_000_000, 12)
    // Only s1 has an execute_tool span → proves `spans WHERE session_id IN (population)`.
    expect(metrics.values["tools.calls"]).toBe(1)
    expect(metrics.values["tools.distinct"]).toBe(1)
    expect(metrics.topTools).toEqual([{ key: "search", label: "search", value: 1 }])
    // Two score rows carrying a signal on s1 → proves scores IN population.
    expect(metrics.values["signals.occurrences"]).toBe(2)
    expect(metrics.values["signals.distinct"]).toBe(1)
    expect(metrics.topSignals[0]?.value).toBe(2)
    // One observation / one moment on s1 → proves taxonomy + moments IN population.
    expect(metrics.values["behaviours.observations"]).toBe(1)
    expect(metrics.values["behaviours.distinct_clusters"]).toBe(1)
    expect(metrics.values["behaviours.moments"]).toBe(1)
    expect(metrics.topBehaviours).toEqual([{ key: "cluster_1", label: "cluster_1", value: 1 }])
  })

  it("narrows the population by a filter (child metrics follow the filtered sessions)", async () => {
    // A cost floor above s1's 100 microcents but below s2's 300 keeps only s2.
    const metrics = await run((reader) =>
      reader.computeVariantMetrics({
        organizationId: ORG,
        projectId: PROJ,
        filterSet: { cost: [{ op: "gt", value: 200 }] },
        query: null,
        range: RANGE,
      }),
    )
    expect(metrics.values["sessions.count"]).toBe(1)
    expect(metrics.values["sessions.users"]).toBe(1)
    // s2 has no tool span / signal / observation, so child metrics are empty despite the data on s1.
    expect(metrics.values["tools.calls"]).toBe(0)
    expect(metrics.values["signals.occurrences"]).toBe(0)
    expect(metrics.values["behaviours.observations"]).toBe(0)
    expect(metrics.topTools).toEqual([])
    expect(metrics.topSignals).toEqual([])
  })

  it("returns zeros and empty top lists for an empty population", async () => {
    const metrics = await run((reader) =>
      reader.computeVariantMetrics({
        organizationId: ORG,
        projectId: PROJ,
        filterSet: {},
        query: null,
        range: EMPTY_RANGE,
      }),
    )
    expect(metrics.values["sessions.count"]).toBe(0)
    expect(metrics.values["tools.calls"]).toBe(0)
    expect(metrics.values["signals.occurrences"]).toBe(0)
    expect(metrics.values["behaviours.observations"]).toBe(0)
    expect(metrics.topTools).toEqual([])
    expect(metrics.topSignals).toEqual([])
    expect(metrics.topBehaviours).toEqual([])
  })

  it("summary counts distinct sessions and users across variant populations", async () => {
    const counts = await run((reader) =>
      reader.computeSummaryMetrics({
        organizationId: ORG,
        projectId: PROJ,
        populations: [
          { filterSet: { cost: [{ op: "lt", value: 200 }] }, query: null, range: RANGE }, // s1
          { filterSet: { cost: [{ op: "gt", value: 200 }] }, query: null, range: RANGE }, // s2
        ],
      }),
    )
    expect(counts.sessionsDistinct).toBe(2)
    expect(counts.usersDistinct).toBe(2)
  })

  it("deduplicates overlapping populations in the summary union", async () => {
    const counts = await run((reader) =>
      reader.computeSummaryMetrics({
        organizationId: ORG,
        projectId: PROJ,
        populations: [
          { filterSet: {}, query: null, range: RANGE }, // s1 + s2
          { filterSet: { cost: [{ op: "lt", value: 200 }] }, query: null, range: RANGE }, // s1 again
        ],
      }),
    )
    expect(counts.sessionsDistinct).toBe(2)
    expect(counts.usersDistinct).toBe(2)
  })
})
