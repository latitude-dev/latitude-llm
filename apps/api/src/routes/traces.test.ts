import { insertJsonEachRow } from "@platform/db-clickhouse"
import {
  closeInMemoryPostgres,
  createApiKeyAuthHeaders,
  createInMemoryPostgres,
  createTestClickHouse,
  type InMemoryPostgres,
  loadClickHouseSchema,
} from "@platform/testkit"
import { Effect } from "effect"
import type { Hono } from "hono"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import { createProtectedApp, createTenantSetup, TEST_ENCRYPTION_KEY_HEX } from "../test-utils/create-test-app.ts"
import { createTracesRoutes } from "./traces.ts"

// ---------------------------------------------------------------------------
// Test span row factory (mirrors trace-repository.test.ts)
// ---------------------------------------------------------------------------

type SpanRow = {
  organization_id: string
  project_id: string
  session_id: string
  trace_id: string
  span_id: string
  parent_span_id: string
  api_key_id: string
  start_time: string
  end_time: string
  name: string
  service_name: string
  kind: number
  status_code: number
  status_message: string
  error_type: string
  tags: string[]
  operation: string
  provider: string
  model: string
  response_model: string
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create: number
  tokens_reasoning: number
  cost_input_microcents: number
  cost_output_microcents: number
  cost_total_microcents: number
  cost_is_estimated: number
  response_id: string
  finish_reasons: string[]
  input_messages: string
  output_messages: string
  system_instructions: string
  tool_definitions: string
  attr_string: Record<string, string>
  attr_int: Record<string, number>
  attr_float: Record<string, number>
  attr_bool: Record<string, number>
  resource_string: Record<string, string>
  scope_name: string
  scope_version: string
}

function makeSpanRow(
  overrides: Partial<SpanRow> & { trace_id: string; span_id: string; organization_id: string; project_id: string },
): SpanRow {
  return {
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

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe("Traces Routes Integration", () => {
  let app: Hono
  let database: InMemoryPostgres
  let tenantA: { organizationId: string; apiKeyToken: string; authApiKeyId: string }
  let tenantB: { organizationId: string; apiKeyToken: string; authApiKeyId: string }
  const ch = createTestClickHouse()

  const TRACE_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
  const TRACE_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2"

  beforeAll(async () => {
    process.env.LAT_API_KEY_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
    database = await createInMemoryPostgres()

    loadClickHouseSchema(ch)

    const { app: root, protectedRoutes } = createProtectedApp(database)

    // Inject test ClickHouse client into context
    protectedRoutes.use("*", async (c, next) => {
      c.set("clickhouse", ch.client)
      await next()
    })

    protectedRoutes.route("/:organizationId/projects/:projectId/traces", createTracesRoutes())
    root.route("/v1/organizations", protectedRoutes)
    app = root

    tenantA = await createTenantSetup(database)
    tenantB = await createTenantSetup(database)

    const projectA = "proj-a"

    // Seed trace A for tenant A — gpt-4, tagged "production"
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        makeSpanRow({
          organization_id: tenantA.organizationId,
          project_id: projectA,
          trace_id: TRACE_A,
          span_id: "span-a1",
          model: "gpt-4",
          tags: ["production"],
          tokens_input: 100,
          tokens_output: 50,
          cost_total_microcents: 100,
        }),
      ]),
    )

    // Seed trace B for tenant A — claude-3, tagged "staging"
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        makeSpanRow({
          organization_id: tenantA.organizationId,
          project_id: projectA,
          trace_id: TRACE_B,
          span_id: "span-b1",
          model: "claude-3",
          tags: ["staging"],
          tokens_input: 200,
          tokens_output: 100,
          cost_total_microcents: 200,
        }),
      ]),
    )
  })

  afterAll(async () => {
    await destroyTouchBuffer()
    await closeInMemoryPostgres(database)
    ch.cleanup()
  })

  const query = (orgId: string, projectId: string, apiKeyToken: string, body: Record<string, unknown> = {}) =>
    app.fetch(
      new Request(`http://localhost/v1/organizations/${orgId}/projects/${projectId}/traces/query`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    )

  it("returns 200 with all traces when no filters provided", async () => {
    const response = await query(tenantA.organizationId, "proj-a", tenantA.apiKeyToken)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { traces: { traceId: string }[] }
    const ids = body.traces.map((t) => t.traceId)
    expect(ids).toContain(TRACE_A)
    expect(ids).toContain(TRACE_B)
  })

  it("filters by model (array contains)", async () => {
    const response = await query(tenantA.organizationId, "proj-a", tenantA.apiKeyToken, {
      filters: [{ type: "array", field: "models", op: "contains", value: "gpt-4" }],
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { traces: { traceId: string }[] }
    const ids = body.traces.map((t) => t.traceId)
    expect(ids).toContain(TRACE_A)
    expect(ids).not.toContain(TRACE_B)
  })

  it("filters by tag containment", async () => {
    const response = await query(tenantA.organizationId, "proj-a", tenantA.apiKeyToken, {
      filters: [{ type: "array", field: "tags", op: "contains", value: "staging" }],
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { traces: { traceId: string }[] }
    const ids = body.traces.map((t) => t.traceId)
    expect(ids).toContain(TRACE_B)
    expect(ids).not.toContain(TRACE_A)
  })

  it("filters by total cost range (number between)", async () => {
    const response = await query(tenantA.organizationId, "proj-a", tenantA.apiKeyToken, {
      filters: [{ type: "number", field: "costTotalMicrocents", op: "between", min: 50, max: 150 }],
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { traces: { traceId: string }[] }
    const ids = body.traces.map((t) => t.traceId)
    expect(ids).toContain(TRACE_A)
    expect(ids).not.toContain(TRACE_B)
  })

  it("returns 400 for unknown filter field", async () => {
    const response = await query(tenantA.organizationId, "proj-a", tenantA.apiKeyToken, {
      filters: [{ type: "string", field: "unknownColumn", op: "eq", value: "x" }],
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain("unknownColumn")
  })

  it("tenant isolation — tenant B cannot see tenant A traces", async () => {
    const response = await query(tenantB.organizationId, "proj-a", tenantB.apiKeyToken)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { traces: { traceId: string }[] }
    const ids = body.traces.map((t) => t.traceId)
    expect(ids).not.toContain(TRACE_A)
    expect(ids).not.toContain(TRACE_B)
  })

  it("negated filter excludes matching traces", async () => {
    const response = await query(tenantA.organizationId, "proj-a", tenantA.apiKeyToken, {
      filters: [{ type: "array", field: "tags", op: "contains", value: "production", negated: true }],
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { traces: { traceId: string }[] }
    const ids = body.traces.map((t) => t.traceId)
    expect(ids).not.toContain(TRACE_A)
    expect(ids).toContain(TRACE_B)
  })
})
