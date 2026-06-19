import { type ChSqlClient, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
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

    it("returns the called tool name and the defined tool names", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "4444444444444444",
            operation: "execute_tool",
            tool_name: "lookup_order",
            tool_call_id: "call_1",
          }),
          makeSpanRow({
            span_id: "5555555555555555",
            operation: "chat",
            tool_definitions: '[{"name":"defined_only_tool","description":"d","parameters":{}}]',
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

      const toolSpan = spans.find((span) => span.spanId === "4444444444444444")
      const chatSpan = spans.find((span) => span.spanId === "5555555555555555")
      expect(toolSpan?.toolName).toBe("lookup_order")
      expect(toolSpan?.toolNames).toEqual([])
      expect(chatSpan?.toolName).toBe("")
      expect(chatSpan?.toolNames).toEqual(["defined_only_tool"])
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

  describe("listByIngestedAtWindow", () => {
    const WINDOW_END = new Date("2026-01-01T01:00:00.000Z")
    const startCursor = { ingestedAt: new Date("2026-01-01T00:00:00.000Z"), spanId: SpanId("") }

    const listWindow = (cursor: typeof startCursor, limit: number) =>
      runCh(
        repo.listByIngestedAtWindow({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          cursor,
          windowEnd: WINDOW_END,
          limit,
        }),
      )

    it("picks up a late-arriving span by ingested_at regardless of start_time", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "1111111111111111",
            start_time: "2025-11-01 00:00:00.000000000",
            end_time: "2025-11-01 00:00:01.000000000",
            ingested_at: "2026-01-01 00:10:00.000",
          }),
        ]),
      )

      const window = await listWindow(startCursor, 10)

      expect(window.spans.map((span) => span.spanId)).toEqual(["1111111111111111"])
      expect(window.nextCursor).toEqual({
        ingestedAt: new Date("2026-01-01T00:10:00.000Z"),
        spanId: "1111111111111111",
      })
    })

    it("resumes a same-millisecond batch cut by the limit without losing or repeating spans", async () => {
      const batchIngestedAt = "2026-01-01 00:10:00.000"
      const spanIds = [
        "1111111111111111",
        "2222222222222222",
        "3333333333333333",
        "4444444444444444",
        "5555555555555555",
      ]
      await runCh(
        insertJsonEachRow(
          ch.client,
          "spans",
          spanIds.map((spanId) => makeSpanRow({ span_id: spanId, ingested_at: batchIngestedAt })),
        ),
      )

      const first = await listWindow(startCursor, 2)
      expect(first.spans.map((span) => span.spanId)).toEqual(["1111111111111111", "2222222222222222"])
      expect(first.nextCursor).toEqual({
        ingestedAt: new Date("2026-01-01T00:10:00.000Z"),
        spanId: "2222222222222222",
      })

      const delivered: string[] = []
      let cursor = startCursor
      for (let page = 0; page < 10; page++) {
        const window = await listWindow(cursor, 2)
        if (window.nextCursor === null) {
          expect(window.spans).toHaveLength(0)
          break
        }
        delivered.push(...window.spans.map((span) => span.spanId as string))
        cursor = window.nextCursor
      }

      expect(delivered).toEqual(spanIds)
    })

    it("dedupes re-inserted span_id rows keeping the newest ingested_at", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ span_id: "1111111111111111", name: "older", ingested_at: "2026-01-01 00:10:00.000" }),
          makeSpanRow({ span_id: "1111111111111111", name: "newer", ingested_at: "2026-01-01 00:20:00.000" }),
        ]),
      )

      const window = await listWindow(startCursor, 10)

      expect(window.spans).toHaveLength(1)
      expect(window.spans[0]?.name).toBe("newer")
      expect(window.nextCursor).toEqual({
        ingestedAt: new Date("2026-01-01T00:20:00.000Z"),
        spanId: "1111111111111111",
      })
    })

    it("includes rows up to windowEnd, excludes rows past it, and scopes by org and project", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ span_id: "1111111111111111", ingested_at: "2026-01-01 00:10:00.000" }),
          makeSpanRow({ span_id: "2222222222222222", ingested_at: "2026-01-01 01:00:00.000" }),
          makeSpanRow({ span_id: "3333333333333333", ingested_at: "2026-01-01 01:00:00.001" }),
          makeSpanRow({
            span_id: "4444444444444444",
            project_id: OTHER_PROJECT_ID,
            ingested_at: "2026-01-01 00:10:00.000",
          }),
          makeSpanRow({
            span_id: "5555555555555555",
            organization_id: "org_span_repo_other",
            ingested_at: "2026-01-01 00:10:00.000",
          }),
        ]),
      )

      const window = await listWindow(startCursor, 10)

      expect(window.spans.map((span) => span.spanId)).toEqual(["1111111111111111", "2222222222222222"])
      expect(window.nextCursor).toEqual({
        ingestedAt: new Date("2026-01-01T01:00:00.000Z"),
        spanId: "2222222222222222",
      })

      const exhausted = await listWindow(
        { ingestedAt: new Date("2026-01-01T01:00:00.000Z"), spanId: SpanId("2222222222222222") },
        10,
      )
      expect(exhausted.spans).toHaveLength(0)
      expect(exhausted.nextCursor).toBeNull()
    })
  })

  describe("findIngestedAtFloorForRecentLimit", () => {
    const WINDOW_END = new Date("2026-01-01T02:00:00.000Z")

    const insertFive = () =>
      runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ span_id: "1111111111111111", ingested_at: "2026-01-01 00:10:00.000" }),
          makeSpanRow({ span_id: "2222222222222222", ingested_at: "2026-01-01 00:20:00.000" }),
          makeSpanRow({ span_id: "3333333333333333", ingested_at: "2026-01-01 00:30:00.000" }),
          makeSpanRow({ span_id: "4444444444444444", ingested_at: "2026-01-01 00:40:00.000" }),
          makeSpanRow({ span_id: "5555555555555555", ingested_at: "2026-01-01 00:50:00.000" }),
        ]),
      )

    it("returns the (limit+1)-th most recent ingested_at as the exclusive floor", async () => {
      await insertFive()

      const floor = await runCh(
        repo.findIngestedAtFloorForRecentLimit({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          windowEnd: WINDOW_END,
          limit: 2,
        }),
      )

      // The 2 most recent are 00:50 and 00:40; the floor (3rd most recent) is 00:30.
      expect(floor).toEqual(new Date("2026-01-01T00:30:00.000Z"))
    })

    it("returns null when there are no more than `limit` records (no cap needed)", async () => {
      await insertFive()

      const floor = await runCh(
        repo.findIngestedAtFloorForRecentLimit({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          windowEnd: WINDOW_END,
          limit: 5,
        }),
      )

      expect(floor).toBeNull()
    })
  })

  describe("findMessagesForSession", () => {
    const SESSION_ID = SessionId("session-replay")
    const TRACE_A = TraceId("cccccccccccccccccccccccccccccccc")
    const TRACE_B = TraceId("dddddddddddddddddddddddddddddddd")
    const ORPHAN_TRACE = TraceId("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")

    const insertSessionFixture = () =>
      runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: "aaaa111111111111",
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"older"}]}]',
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:01.000000000",
            ingested_at: "2026-03-01 00:00:00.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: "aaaa111111111111",
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"newer"}]}]',
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:01.000000000",
            ingested_at: "2026-03-01 00:00:01.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: "aaaa222222222222",
            operation: "",
            start_time: "2026-03-01 00:00:01.000000000",
            end_time: "2026-03-01 00:00:02.000000000",
            ingested_at: "2026-03-01 00:00:01.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_B,
            span_id: "bbbb111111111111",
            operation: "execute_tool",
            tool_call_id: "call_1",
            start_time: "2026-03-01 00:01:00.000000000",
            end_time: "2026-03-01 00:01:01.000000000",
            ingested_at: "2026-03-01 00:01:00.000",
          }),
          makeSpanRow({
            session_id: "session-other",
            trace_id: TraceId("ffffffffffffffffffffffffffffffff"),
            span_id: "ffff111111111111",
            operation: "chat",
            start_time: "2026-03-01 00:02:00.000000000",
            end_time: "2026-03-01 00:02:01.000000000",
            ingested_at: "2026-03-01 00:02:00.000",
          }),
          makeSpanRow({
            session_id: "",
            trace_id: ORPHAN_TRACE,
            span_id: "ee11111111111111",
            operation: "chat",
            start_time: "2026-03-01 00:03:00.000000000",
            end_time: "2026-03-01 00:03:01.000000000",
            ingested_at: "2026-03-01 00:03:00.000",
          }),
        ]),
      )

    it("returns deduped LLM/tool spans across all traces in the session, ordered by start time", async () => {
      await insertSessionFixture()
      const spans = await runCh(
        repo.findMessagesForSession({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          sessionId: SESSION_ID,
          startTimeFrom: new Date("2026-03-01T00:00:00.000Z"),
          startTimeTo: new Date("2026-03-01T00:10:00.000Z"),
        }),
      )

      expect(spans.map((span) => span.spanId)).toEqual(["aaaa111111111111", "bbbb111111111111"])
      expect(spans[0]?.outputMessages[0]?.parts?.[0]).toMatchObject({ content: "newer" })
      expect(spans[1]?.toolCallId).toBe("call_1")
    })

    it("matches orphan single-trace sessions keyed by trace id", async () => {
      await insertSessionFixture()
      const spans = await runCh(
        repo.findMessagesForSession({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          sessionId: SessionId(ORPHAN_TRACE as string),
          startTimeFrom: new Date("2026-03-01T00:00:00.000Z"),
          startTimeTo: new Date("2026-03-01T00:10:00.000Z"),
        }),
      )

      expect(spans.map((span) => span.spanId)).toEqual(["ee11111111111111"])
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

    it("returns the materialized tool names despite the SELECT *", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "6666666666666666",
            operation: "chat",
            tool_definitions: '[{"name":"defined_only_tool","description":"d","parameters":{}}]',
          }),
        ]),
      )

      const span = await runCh(
        repo.findBySpanId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          spanId: SpanId("6666666666666666"),
          startTimeFrom: new Date("2026-01-01T00:00:00.000Z"),
          startTimeTo: new Date("2026-01-01T00:00:01.000Z"),
        }),
      )

      expect(span.toolNames).toEqual(["defined_only_tool"])
      expect(span.toolDefinitions).toEqual([{ name: "defined_only_tool", description: "d", parameters: {} }])
    })
  })
})
