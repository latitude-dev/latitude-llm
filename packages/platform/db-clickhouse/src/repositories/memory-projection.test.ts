import { type MemoryRepository, materializeTraceMemoryUseCase, reconstructSnapshotUseCase } from "@domain/memories"
import { type ChSqlClient, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import type { SpanRepository } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { MemoryRepositoryLive } from "./memory-repository.ts"
import { SpanRepositoryLive } from "./span-repository.ts"

const ORG = OrganizationId("org_mem_proj_test")
const PROJECT = ProjectId("proj_mem_proj_test")
const TRACE = TraceId("a".repeat(32))
const SCOPE = "user-1" // resolves from user_id (no scope attribute set)

const ch = setupTestClickHouse()

const provide = <A, E>(effect: Effect.Effect<A, E, SpanRepository | MemoryRepository | ChSqlClient>) =>
  Effect.runPromise(
    effect.pipe(withClickHouse(Layer.mergeAll(SpanRepositoryLive, MemoryRepositoryLive), ch.client, ORG)),
  )

const rawRows = <T>(query: string) =>
  Effect.runPromise(
    Effect.tryPromise(async () => {
      const result = await ch.client.query({
        query,
        query_params: { organizationId: ORG as string },
        format: "JSONEachRow",
      })
      return result.json<T>()
    }),
  )

const chTime = (seconds: number) => `2026-06-01 12:00:0${seconds}.000000000`

const memorySpanRow = (o: {
  spanId: string
  operation: string
  endSecond: number
  storeId?: string
  recordId?: string
  recordCount?: number
  queryText?: string
  records?: { id: string; content: string; score?: number }[]
}) => ({
  organization_id: ORG,
  project_id: PROJECT,
  session_id: "sess-1",
  user_id: "user-1",
  trace_id: TRACE,
  span_id: o.spanId,
  parent_span_id: "",
  api_key_id: "",
  simulation_id: "",
  start_time: chTime(o.endSecond),
  end_time: chTime(o.endSecond),
  name: o.operation,
  service_name: "svc",
  kind: 3,
  status_code: 0,
  status_message: "",
  error_type: "",
  tags: [],
  metadata: {},
  operation: o.operation,
  provider: "",
  model: "",
  response_model: "",
  tokens_input: 0,
  tokens_output: 0,
  tokens_cache_read: 0,
  tokens_cache_create: 0,
  tokens_reasoning: 0,
  cost_input_microcents: 0,
  cost_output_microcents: 0,
  cost_total_microcents: 0,
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
  tool_name: "",
  tool_input: "",
  tool_output: "",
  attr_string: {
    "gen_ai.memory.store.id": o.storeId ?? "store1",
    "gen_ai.memory.record.id": o.recordId ?? "",
    "gen_ai.memory.query.text": o.queryText ?? "",
    ...(o.records ? { "gen_ai.memory.records": JSON.stringify(o.records) } : {}),
  },
  attr_int: { "gen_ai.memory.record.count": o.recordCount ?? 1 },
  attr_float: {},
  attr_bool: {},
  resource_string: {},
  scope_name: "",
  scope_version: "",
  ingested_at: chTime(o.endSecond),
})

describe("memory projection (end to end)", () => {
  it("materializes seeded memory spans into the three tables and reconstructs manifests", async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        memorySpanRow({
          spanId: "1111111111111111",
          operation: "create_memory",
          endSecond: 0,
          records: [{ id: "rec1", content: "v1" }],
        }),
        memorySpanRow({
          spanId: "2222222222222222",
          operation: "create_memory",
          endSecond: 1,
          records: [{ id: "rec2", content: "shared" }],
        }),
        memorySpanRow({
          spanId: "3333333333333333",
          operation: "create_memory",
          endSecond: 2,
          records: [{ id: "rec3", content: "shared" }],
        }),
        memorySpanRow({
          spanId: "4444444444444444",
          operation: "update_memory",
          endSecond: 3,
          records: [{ id: "rec1", content: "v2" }],
        }),
        memorySpanRow({
          spanId: "5555555555555555",
          operation: "search_memory",
          endSecond: 4,
          queryText: "find",
          records: [{ id: "rec1", content: "v2", score: 0.9 }],
        }),
      ]),
    )

    const result = await provide(
      materializeTraceMemoryUseCase({ organizationId: ORG, projectId: PROJECT, traceId: TRACE }),
    )
    expect(result.eventCount).toBe(5)
    expect(result.blobCount).toBe(3) // v1, v2, shared — the duplicate "shared" body dedups

    const events = await rawRows<{ n: string | number }>(
      "SELECT count() AS n FROM memory_events WHERE organization_id = {organizationId:String}",
    )
    expect(Number(events[0]?.n)).toBe(5)
    const blobs = await rawRows<{ n: string | number }>(
      "SELECT count() AS n FROM memory_blobs FINAL WHERE organization_id = {organizationId:String}",
    )
    expect(Number(blobs[0]?.n)).toBe(3)

    const now = await provide(reconstructSnapshotUseCase({ organizationId: ORG, projectId: PROJECT, scope: SCOPE }))
    expect(now.records.map((record) => record.recordId).sort()).toEqual(["rec1", "rec2", "rec3"])
    const rec1Now = now.records.find((record) => record.recordId === "rec1")
    expect(rec1Now?.changeKind).toBe("update")

    const past = await provide(
      reconstructSnapshotUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        scope: SCOPE,
        at: new Date("2026-06-01T12:00:00.500Z"),
      }),
    )
    expect(past.records.map((record) => record.recordId)).toEqual(["rec1"])
    expect(past.records[0]?.changeKind).toBe("add") // only the create is in scope at t0.5
  })
})
