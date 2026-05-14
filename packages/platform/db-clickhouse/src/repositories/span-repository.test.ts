import { type ChSqlClient, OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import { SpanRepository, type SpanRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { SpanRepositoryLive } from "./span-repository.ts"

const ch = setupTestClickHouse()

const ORG_ID = OrganizationId("org_span_repo_test")
const PROJECT_ID = ProjectId("proj_span_repo_test")
const OTHER_PROJECT_ID = ProjectId("proj_span_repo_other")
const TRACE_ID = TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

function makeSpanRow(overrides: Record<string, unknown>) {
  return {
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    session_id: "session-1",
    user_id: "user-1",
    trace_id: TRACE_ID,
    span_id: "1111111111111111",
    parent_span_id: "",
    api_key_id: "api-key-1",
    simulation_id: "",
    start_time: "2026-01-01 00:00:00.000000000",
    end_time: "2026-01-01 00:00:01.000000000",
    name: "original",
    service_name: "svc",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: "",
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
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
    ingested_at: "2026-01-01 00:00:00.000",
    ...overrides,
  }
}

describe("SpanRepository", () => {
  let repo: SpanRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* SpanRepository
      }).pipe(withClickHouse(SpanRepositoryLive, ch.client, ORG_ID)),
    )
  })

  describe("listByTraceId", () => {
    it("scopes by project and time window, and dedupes spans without FINAL", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ name: "older", ingested_at: "2026-01-01 00:00:00.000" }),
          makeSpanRow({ name: "newer", ingested_at: "2026-01-01 00:00:01.000" }),
          makeSpanRow({
            project_id: OTHER_PROJECT_ID,
            name: "other-project",
            ingested_at: "2026-01-01 00:00:02.000",
          }),
          makeSpanRow({
            span_id: "2222222222222222",
            name: "outside-time-window",
            start_time: "2026-02-01 00:00:00.000000000",
            end_time: "2026-02-01 00:00:01.000000000",
          }),
        ]),
      )

      const spans = await runCh(
        repo.listByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          startTimeFrom: new Date("2026-01-01T00:00:00.000Z"),
          startTimeTo: new Date("2026-01-01T00:00:01.000Z"),
        }),
      )

      expect(spans).toHaveLength(1)
      expect(spans[0]?.name).toBe("newer")
      expect(spans[0]?.projectId).toBe(PROJECT_ID)
    })
  })

  describe("listByProjectId", () => {
    it("uses direct time predicates and dedupes before pagination", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ span_id: "1111111111111111", name: "older", ingested_at: "2026-01-01 00:00:00.000" }),
          makeSpanRow({ span_id: "1111111111111111", name: "newer", ingested_at: "2026-01-01 00:00:01.000" }),
          makeSpanRow({
            span_id: "2222222222222222",
            name: "second",
            start_time: "2026-01-01 00:00:02.000000000",
            end_time: "2026-01-01 00:00:03.000000000",
          }),
          makeSpanRow({
            span_id: "3333333333333333",
            name: "outside-time-window",
            start_time: "2026-02-01 00:00:00.000000000",
            end_time: "2026-02-01 00:00:01.000000000",
          }),
        ]),
      )

      const spans = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: {
            startTimeFrom: new Date("2026-01-01T00:00:00.000Z"),
            startTimeTo: new Date("2026-01-01T00:00:03.000Z"),
            limit: 10,
          },
        }),
      )

      expect(spans.map((span) => span.name)).toEqual(["second", "newer"])
    })
  })

  describe("findBySpanId", () => {
    it("scopes by project and returns the latest ingested row without FINAL", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ name: "older", ingested_at: "2026-01-01 00:00:00.000" }),
          makeSpanRow({ name: "newer", ingested_at: "2026-01-01 00:00:01.000" }),
          makeSpanRow({
            project_id: OTHER_PROJECT_ID,
            name: "other-project",
            ingested_at: "2026-01-01 00:00:02.000",
          }),
        ]),
      )

      const span = await runCh(
        repo.findBySpanId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          spanId: SpanId("1111111111111111"),
          startTimeFrom: new Date("2026-01-01T00:00:00.000Z"),
          startTimeTo: new Date("2026-01-01T00:00:01.000Z"),
        }),
      )

      expect(span.name).toBe("newer")
      expect(span.projectId).toBe(PROJECT_ID)
    })
  })
})
