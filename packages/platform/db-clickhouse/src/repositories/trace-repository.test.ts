import { OrganizationId, ProjectId } from "@domain/shared"
import type { FieldFilter } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import type { SpanRow } from "../seeds/spans/generator.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceRepositoryLive } from "./trace-repository.ts"

const ORG_ID = OrganizationId("org-filter-test")
const PROJECT_ID = ProjectId("proj-filter-test")
const TRACE_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
const TRACE_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2"

const ch = setupTestClickHouse()

/** Minimal valid span row for insertion. */
function makeSpanRow(overrides: Partial<SpanRow> & { trace_id: string; span_id: string }): SpanRow {
  return {
    organization_id: ORG_ID as string,
    project_id: PROJECT_ID as string,
    session_id: "sess-1",
    parent_span_id: "",
    api_key_id: "api-key-1",
    start_time: "2024-06-01 10:00:00.000000000",
    end_time: "2024-06-01 10:00:01.000000000",
    name: "test-span",
    service_name: "test-service",
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: [],
    operation: "chat",
    provider: "openai",
    model: "gpt-4",
    response_model: "gpt-4",
    tokens_input: 100,
    tokens_output: 50,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 50,
    cost_output_microcents: 25,
    cost_total_microcents: 75,
    cost_is_estimated: 0,
    response_id: "",
    finish_reasons: ["stop"],
    input_messages: "[]",
    output_messages: "[]",
    system_instructions: "",
    tool_definitions: "[]",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
    ...overrides,
  }
}

describe("TraceRepository — filter integration", () => {
  beforeAll(async () => {
    // Trace A: gpt-4, tagged "production", 200 tokens total
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        makeSpanRow({
          trace_id: TRACE_A,
          span_id: "span-a1",
          model: "gpt-4",
          tags: ["production", "v2"],
          tokens_input: 150,
          tokens_output: 50,
          cost_total_microcents: 100,
          status_code: 1, // ok
        }),
      ]),
    )

    // Trace B: claude-3, tagged "staging", 300 tokens total
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        makeSpanRow({
          trace_id: TRACE_B,
          span_id: "span-b1",
          model: "claude-3",
          tags: ["staging"],
          tokens_input: 200,
          tokens_output: 100,
          cost_total_microcents: 200,
          status_code: 1, // ok
        }),
      ]),
    )
  })

  const findTraces = (filters: readonly FieldFilter[] = []) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.findByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { filters },
        })
      }).pipe(withClickHouse(TraceRepositoryLive, ch.client, ORG_ID)),
    )

  it("returns all traces when no filters provided", async () => {
    const traces = await findTraces([])
    const ids = traces.map((t) => t.traceId as string)
    expect(ids).toContain(TRACE_A)
    expect(ids).toContain(TRACE_B)
  })

  it("filters by exact traceId (WHERE string eq)", async () => {
    const traces = await findTraces([{ type: "string", field: "traceId", op: "eq", value: TRACE_A }])
    expect(traces).toHaveLength(1)
    const first = traces[0]
    expect(first?.traceId as string).toBe(TRACE_A)
  })

  it("filters by tag containment (WHERE array contains)", async () => {
    const traces = await findTraces([{ type: "array", field: "tags", op: "contains", value: "production" }])
    const ids = traces.map((t) => t.traceId as string)
    expect(ids).toContain(TRACE_A)
    expect(ids).not.toContain(TRACE_B)
  })

  it("filters by model containment (HAVING array contains)", async () => {
    const traces = await findTraces([{ type: "array", field: "models", op: "contains", value: "claude-3" }])
    const ids = traces.map((t) => t.traceId as string)
    expect(ids).toContain(TRACE_B)
    expect(ids).not.toContain(TRACE_A)
  })

  it("filters by total cost range (HAVING number between)", async () => {
    // Only trace A has cost_total = 100; trace B = 200
    const traces = await findTraces([
      { type: "number", field: "costTotalMicrocents", op: "between", min: 50, max: 150 },
    ])
    const ids = traces.map((t) => t.traceId as string)
    expect(ids).toContain(TRACE_A)
    expect(ids).not.toContain(TRACE_B)
  })

  it("filters by start time range (WHERE date between)", async () => {
    const traces = await findTraces([
      {
        type: "date",
        field: "startTime",
        op: "between",
        min: "2024-01-01T00:00:00.000Z",
        max: "2024-12-31T23:59:59.999Z",
      },
    ])
    const ids = traces.map((t) => t.traceId as string)
    expect(ids).toContain(TRACE_A)
    expect(ids).toContain(TRACE_B)
  })

  it("negates a filter to exclude matching traces", async () => {
    const traces = await findTraces([
      { type: "array", field: "tags", op: "contains", value: "production", negated: true },
    ])
    const ids = traces.map((t) => t.traceId as string)
    expect(ids).not.toContain(TRACE_A)
    expect(ids).toContain(TRACE_B)
  })

  it("combines multiple filters (AND semantics)", async () => {
    // Only trace A: has tag "production" AND has model "gpt-4"
    const traces = await findTraces([
      { type: "array", field: "tags", op: "contains", value: "production" },
      { type: "array", field: "models", op: "contains", value: "gpt-4" },
    ])
    const ids = traces.map((t) => t.traceId as string)
    expect(ids).toContain(TRACE_A)
    expect(ids).not.toContain(TRACE_B)
  })

  it("ignores unknown filter fields without error", async () => {
    // unknownField is not in schema — should be silently skipped, returning all traces
    // Cast needed to test with a field name that's not in the type union
    const badFilter = { type: "string", field: "unknownField", op: "eq", value: "anything" } as unknown as FieldFilter
    const traces = await findTraces([badFilter])
    expect(traces.length).toBeGreaterThanOrEqual(2)
  })
})
