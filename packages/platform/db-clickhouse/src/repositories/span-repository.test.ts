import { type ChSqlClient, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { type SpanListCursor, type SpanListPage, SpanRepository, type SpanRepositoryShape } from "@domain/spans"
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

  describe("listByTraceIds", () => {
    it("returns spans across multiple traces, deduping by (trace_id, span_id)", async () => {
      const traceA = TraceId("a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1")
      const traceB = TraceId("b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2")
      const traceC = TraceId("c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3")
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          // Same span id in two traces + a re-ingested duplicate within trace A.
          makeSpanRow({
            trace_id: traceA,
            span_id: "abababababababab",
            name: "a-older",
            ingested_at: "2026-01-01 00:00:00.000",
          }),
          makeSpanRow({
            trace_id: traceA,
            span_id: "abababababababab",
            name: "a-newer",
            ingested_at: "2026-01-01 00:00:01.000",
          }),
          makeSpanRow({
            trace_id: traceB,
            span_id: "abababababababab",
            name: "b",
            start_time: "2026-01-01 00:00:02.000000000",
            end_time: "2026-01-01 00:00:03.000000000",
          }),
          // A trace not requested — must be excluded.
          makeSpanRow({ trace_id: traceC, span_id: "cdcdcdcdcdcdcdcd", name: "c-excluded" }),
        ]),
      )

      const spans = await runCh(
        repo.listByTraceIds({ organizationId: ORG_ID, projectId: PROJECT_ID, traceIds: [traceA, traceB] }),
      )

      expect(spans.map((span) => span.name)).toEqual(["a-newer", "b"])
      expect(spans.map((span) => span.traceId)).toEqual([traceA, traceB])
    })

    it("returns an empty array for no trace ids without querying", async () => {
      const spans = await runCh(repo.listByTraceIds({ organizationId: ORG_ID, projectId: PROJECT_ID, traceIds: [] }))
      expect(spans).toEqual([])
    })
  })

  describe("findSpanConversationChunk", () => {
    const CHUNK_SPAN = "5c5c5c5c5c5c5c5c"
    const insertConversationSpan = () =>
      runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: CHUNK_SPAN,
            operation: "chat",
            system_instructions: JSON.stringify([{ type: "text", content: "you are a subagent" }]),
            input_messages: JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi" }] }]),
            output_messages: JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "hello" }] }]),
          }),
        ]),
      )

    it("concatenates system + input + output messages, system first", async () => {
      await insertConversationSpan()
      const chunk = await runCh(
        repo.findSpanConversationChunk({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          spanId: SpanId(CHUNK_SPAN),
          offset: 0,
          limit: 25,
        }),
      )
      expect(chunk.totalMessages).toBe(3)
      expect(chunk.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"])
      expect(chunk.hasMore).toBe(false)
    })

    it("slices by offset/limit and reports hasMore", async () => {
      await insertConversationSpan()
      const chunk = await runCh(
        repo.findSpanConversationChunk({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          spanId: SpanId(CHUNK_SPAN),
          offset: 1,
          limit: 1,
        }),
      )
      expect(chunk.messages.map((m) => m.role)).toEqual(["user"])
      expect(chunk.totalMessages).toBe(3)
      expect(chunk.hasMore).toBe(true)
    })

    it("returns an empty chunk for a missing span", async () => {
      const chunk = await runCh(
        repo.findSpanConversationChunk({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          spanId: SpanId("dddddddddddddddd"),
          offset: 0,
          limit: 25,
        }),
      )
      expect(chunk.totalMessages).toBe(0)
      expect(chunk.messages).toEqual([])
    })
  })

  describe("listBySessionId", () => {
    const SESSION_ID = SessionId("session-list")
    const HEX32_SESSION_ID = SessionId("99999999999999999999999999999999")
    const ORPHAN_TRACE = TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")

    const insertListFixture = () =>
      runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            session_id: SESSION_ID,
            span_id: "aaaa000000000001",
            name: "older",
            attr_string: { "ai.prompt": "huge-blob" },
            attr_int: { retries: 2 },
            resource_string: { host: "h1" },
            ingested_at: "2026-01-01 00:00:00.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            span_id: "aaaa000000000001",
            name: "newer",
            attr_string: { "ai.prompt": "huge-blob" },
            ingested_at: "2026-01-01 00:00:01.000",
          }),
          makeSpanRow({
            session_id: "session-other",
            trace_id: TraceId("cccccccccccccccccccccccccccccccc"),
            span_id: "cccc000000000001",
            name: "other-session",
          }),
          // Orphan span whose trace id doubles as its session id.
          makeSpanRow({
            session_id: "",
            trace_id: ORPHAN_TRACE,
            span_id: "dddd000000000001",
            name: "orphan",
          }),
          // Conversation session whose id happens to be 32 chars long.
          makeSpanRow({
            session_id: HEX32_SESSION_ID,
            trace_id: TraceId("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
            span_id: "eeee000000000001",
            name: "hex32-named-session",
          }),
        ]),
      )

    it("returns the session's deduped spans with empty attribute maps", async () => {
      await insertListFixture()

      const spans = await runCh(
        repo.listBySessionId({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId: SESSION_ID }),
      )

      expect(spans.map((span) => span.name)).toEqual(["newer"])
      expect(spans[0]?.attrString).toEqual({})
      expect(spans[0]?.attrInt).toEqual({})
      expect(spans[0]?.attrFloat).toEqual({})
      expect(spans[0]?.attrBool).toEqual({})
      expect(spans[0]?.resourceString).toEqual({})

      const detail = await runCh(
        repo.findBySpanId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          spanId: SpanId("aaaa000000000001"),
        }),
      )
      expect(detail.attrString).toEqual({ "ai.prompt": "huge-blob" })
    })

    it("keeps identical span ids from different traces while deduping re-ingestion within each trace", async () => {
      const otherTrace = TraceId("12121212121212121212121212121212")
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_ID,
            span_id: "abababababababab",
            name: "trace-a-older",
            ingested_at: "2026-01-01 00:00:00.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_ID,
            span_id: "abababababababab",
            name: "trace-a-newer",
            ingested_at: "2026-01-01 00:00:01.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: otherTrace,
            span_id: "abababababababab",
            name: "trace-b",
            start_time: "2026-01-01 00:00:02.000000000",
            end_time: "2026-01-01 00:00:03.000000000",
          }),
        ]),
      )

      const spans = await runCh(
        repo.listBySessionId({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId: SESSION_ID }),
      )

      expect(spans.map((span) => span.name)).toEqual(["trace-a-newer", "trace-b"])
      expect(spans.map((span) => span.traceId)).toEqual([TRACE_ID, otherTrace])
    })

    it("matches orphan single-trace sessions keyed by trace id", async () => {
      await insertListFixture()

      const spans = await runCh(
        repo.listBySessionId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          sessionId: SessionId(ORPHAN_TRACE as string),
        }),
      )

      expect(spans.map((span) => span.name)).toEqual(["orphan"])
    })

    it("matches a conversation session whose id is 32 chars long", async () => {
      await insertListFixture()

      const spans = await runCh(
        repo.listBySessionId({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId: HEX32_SESSION_ID }),
      )

      expect(spans.map((span) => span.name)).toEqual(["hex32-named-session"])
    })

    it("matches nothing for an empty session id (never the orphan spans)", async () => {
      await insertListFixture()

      const spans = await runCh(
        repo.listBySessionId({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId: SessionId("") }),
      )

      expect(spans).toEqual([])
    })

    it("scopes by the optional start-time window", async () => {
      await insertListFixture()
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            session_id: SESSION_ID,
            span_id: "aaaa000000000002",
            name: "outside-window",
            start_time: "2026-02-01 00:00:00.000000000",
            end_time: "2026-02-01 00:00:01.000000000",
          }),
        ]),
      )

      const spans = await runCh(
        repo.listBySessionId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          sessionId: SESSION_ID,
          startTimeFrom: new Date("2026-01-01T00:00:00.000Z"),
          startTimeTo: new Date("2026-01-01T00:00:01.000Z"),
        }),
      )

      expect(spans.map((span) => span.name)).toEqual(["newer"])
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

      expect(spans.items.map((span) => span.name)).toEqual(["second", "newer"])
    })

    it("applies a span-field FilterSet across traces", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ span_id: "aaaaaaaaaaaaaaaa", name: "chat-span", operation: "chat" }),
          makeSpanRow({
            span_id: "bbbbbbbbbbbbbbbb",
            name: "tool-span",
            operation: "execute_tool",
            tool_name: "search",
          }),
        ]),
      )

      const spans = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { limit: 10, filters: { operation: [{ op: "eq", value: "execute_tool" }] } },
        }),
      )

      expect(spans.items.map((span) => span.name)).toEqual(["tool-span"])
    })

    it("late-materializes selected versions without returning dynamic maps", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "late000000000001",
            name: "older",
            metadata: { source: "target" },
            attr_string: { "ai.prompt": "x".repeat(1_000_000) },
            attr_int: { retries: 2 },
            attr_float: { temperature: 0.7 },
            attr_bool: { streamed: 1 },
            resource_string: { host: "worker-1" },
            ingested_at: "2026-01-01 00:00:00.000",
          }),
          makeSpanRow({
            span_id: "late000000000001",
            name: "newer",
            metadata: { source: "target" },
            attr_string: { "ai.prompt": "x".repeat(1_000_000) },
            ingested_at: "2026-01-01 00:00:01.000",
          }),
          makeSpanRow({
            span_id: "late000000000002",
            name: "metadata-miss",
            metadata: { source: "other" },
          }),
        ]),
      )

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { limit: 10, filters: { "metadata.source": [{ op: "eq", value: "target" }] } },
        }),
      )

      expect(page.items).toHaveLength(1)
      expect(page.items[0]).toMatchObject({ name: "newer", metadata: { source: "target" } })
      expect(page.items[0]?.attrString).toEqual({})
      expect(page.items[0]?.attrInt).toEqual({})
      expect(page.items[0]?.attrFloat).toEqual({})
      expect(page.items[0]?.attrBool).toEqual({})
      expect(page.items[0]?.resourceString).toEqual({})
    })

    it("sorts by a chosen field and filters by status", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "0rd0000000000001",
            name: "slow-err",
            operation: "ordtest",
            status_code: 2,
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:03.000000000",
          }),
          makeSpanRow({
            span_id: "0rd0000000000002",
            name: "fast-err",
            operation: "ordtest",
            status_code: 2,
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:01.000000000",
          }),
          makeSpanRow({
            span_id: "0rd0000000000003",
            name: "mid-ok",
            operation: "ordtest",
            status_code: 0,
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:02.000000000",
          }),
        ]),
      )
      const base = { organizationId: ORG_ID, projectId: PROJECT_ID }
      const ordtest = { operation: [{ op: "eq" as const, value: "ordtest" }] }

      const byDuration = await runCh(
        repo.listByProjectId({
          ...base,
          options: { limit: 10, filters: ordtest, orderBy: { field: "duration", direction: "desc" } },
        }),
      )
      expect(byDuration.items.map((span) => span.name)).toEqual(["slow-err", "mid-ok", "fast-err"])

      const errorsOnly = await runCh(
        repo.listByProjectId({
          ...base,
          options: {
            limit: 10,
            filters: { ...ordtest, status: [{ op: "eq", value: "error" }] },
            orderBy: { field: "duration", direction: "desc" },
          },
        }),
      )
      expect(errorsOnly.items.map((span) => span.name)).toEqual(["slow-err", "fast-err"])
    })

    it("keyset-paginates deterministically when spans share start_time", async () => {
      const shared = "2026-04-01 00:00:00.000000000"
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ span_id: "pg00000000000001", name: "first", operation: "keyset", start_time: shared }),
          makeSpanRow({ span_id: "pg00000000000002", name: "second", operation: "keyset", start_time: shared }),
          makeSpanRow({ span_id: "pg00000000000003", name: "third", operation: "keyset", start_time: shared }),
        ]),
      )
      const base = { organizationId: ORG_ID, projectId: PROJECT_ID }
      const opts = { limit: 2, filters: { operation: [{ op: "eq" as const, value: "keyset" }] } }

      // Equal start_time → span_id DESC tiebreaker gives a total order.
      const page1 = await runCh(repo.listByProjectId({ ...base, options: opts }))
      expect(page1.items.map((span) => span.name)).toEqual(["third", "second"])
      const cursor = page1.nextCursor
      expect(cursor).not.toBeNull()
      if (cursor === null) return

      const page2 = await runCh(repo.listByProjectId({ ...base, options: { ...opts, cursor } }))
      expect(page2.items.map((span) => span.name)).toEqual(["first"])
      expect(page2.nextCursor).toBeNull()
    })

    it("keyset-paginates by a non-startTime sort (duration)", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "dur0000000000001",
            name: "d3",
            operation: "durkey",
            start_time: "2026-05-01 00:00:00.000000000",
            end_time: "2026-05-01 00:00:03.000000000",
          }),
          makeSpanRow({
            span_id: "dur0000000000002",
            name: "d2",
            operation: "durkey",
            start_time: "2026-05-01 00:00:00.000000000",
            end_time: "2026-05-01 00:00:02.000000000",
          }),
          makeSpanRow({
            span_id: "dur0000000000003",
            name: "d1",
            operation: "durkey",
            start_time: "2026-05-01 00:00:00.000000000",
            end_time: "2026-05-01 00:00:01.000000000",
          }),
        ]),
      )
      const base = { organizationId: ORG_ID, projectId: PROJECT_ID }
      const opts = {
        limit: 2,
        filters: { operation: [{ op: "eq" as const, value: "durkey" }] },
        orderBy: { field: "duration" as const, direction: "desc" as const },
      }

      const page1 = await runCh(repo.listByProjectId({ ...base, options: opts }))
      expect(page1.items.map((span) => span.name)).toEqual(["d3", "d2"])
      const cursor = page1.nextCursor
      expect(cursor).not.toBeNull()
      if (cursor === null) return

      const page2 = await runCh(repo.listByProjectId({ ...base, options: { ...opts, cursor } }))
      expect(page2.items.map((span) => span.name)).toEqual(["d1"])
    })

    it("keeps matching span ids in separate traces across page boundaries", async () => {
      const traceA = TraceId("11111111111111111111111111111111")
      const traceB = TraceId("22222222222222222222222222222222")
      const sharedStart = "2026-06-01 00:00:00.000000000"
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            trace_id: traceA,
            span_id: "shar000000000001",
            name: "trace-a-old",
            operation: "trace-keyset",
            start_time: sharedStart,
            ingested_at: "2026-06-01 00:00:00.000",
          }),
          makeSpanRow({
            trace_id: traceA,
            span_id: "shar000000000001",
            name: "trace-a-new",
            operation: "trace-keyset",
            start_time: sharedStart,
            ingested_at: "2026-06-01 00:00:01.000",
          }),
          makeSpanRow({
            trace_id: traceB,
            span_id: "shar000000000001",
            name: "trace-b",
            operation: "trace-keyset",
            start_time: sharedStart,
          }),
        ]),
      )
      const options = { limit: 1, filters: { operation: [{ op: "eq" as const, value: "trace-keyset" }] } }

      const first = await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options }))
      expect(first.items.map((span) => span.name)).toEqual(["trace-b"])
      expect(first.nextCursor?.traceId).toBe(traceB)
      expect(first.nextCursor).not.toBeNull()
      if (first.nextCursor === null) return

      const second = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { ...options, cursor: first.nextCursor },
        }),
      )
      expect(second.items.map((span) => span.name)).toEqual(["trace-a-new"])
    })

    it("keyset-paginates every ordering and direction", async () => {
      const base = { organizationId: ORG_ID, projectId: PROJECT_ID }
      const fields = ["startTime", "duration", "cost"] as const
      const directions = ["asc", "desc"] as const

      for (const field of fields) {
        const operation = `all-orders-${field}`
        await runCh(
          insertJsonEachRow(ch.client, "spans", [
            makeSpanRow({
              span_id: `${field.slice(0, 3)}0000000000001`,
              name: `${field}-one`,
              operation,
              start_time: "2026-07-01 00:00:00.000000000",
              end_time: "2026-07-01 00:00:01.000000000",
              cost_total_microcents: 100,
            }),
            makeSpanRow({
              span_id: `${field.slice(0, 3)}0000000000002`,
              name: `${field}-two`,
              operation,
              start_time: "2026-07-01 00:00:02.000000000",
              end_time: "2026-07-01 00:00:04.000000000",
              cost_total_microcents: 200,
            }),
            makeSpanRow({
              span_id: `${field.slice(0, 3)}0000000000003`,
              name: `${field}-three`,
              operation,
              start_time: "2026-07-01 00:00:04.000000000",
              end_time: "2026-07-01 00:00:07.000000000",
              cost_total_microcents: 300,
            }),
          ]),
        )

        for (const direction of directions) {
          const expected = direction === "asc" ? ["one", "two", "three"] : ["three", "two", "one"]
          const delivered: string[] = []
          let cursor: SpanListCursor | null = null

          for (let page = 0; page < 3; page++) {
            const result: SpanListPage = await runCh(
              repo.listByProjectId({
                ...base,
                options: {
                  limit: 1,
                  filters: { operation: [{ op: "eq", value: operation }] },
                  orderBy: { field, direction },
                  ...(cursor ? { cursor } : {}),
                },
              }),
            )
            delivered.push(...result.items.map((span) => span.name.split("-").at(-1) ?? ""))
            cursor = result.nextCursor
            if (cursor === null) break
          }

          expect(delivered).toEqual(expected)
        }
      }
    })

    it("keyset-paginates equal duration and cost values by trace and span id", async () => {
      const traces = [
        TraceId("11111111111111111111111111111111"),
        TraceId("22222222222222222222222222222222"),
        TraceId("33333333333333333333333333333333"),
      ]
      await runCh(
        insertJsonEachRow(
          ch.client,
          "spans",
          traces.map((traceId, index) =>
            makeSpanRow({
              trace_id: traceId,
              span_id: "ties000000000001",
              name: `tie-${index + 1}`,
              operation: "equal-order-values",
              start_time: "2026-08-01 00:00:00.000000000",
              end_time: "2026-08-01 00:00:01.000000000",
              cost_total_microcents: 100,
            }),
          ),
        ),
      )

      for (const field of ["duration", "cost"] as const) {
        for (const direction of ["asc", "desc"] as const) {
          const delivered: string[] = []
          let cursor: SpanListCursor | null = null

          for (let page = 0; page < traces.length; page++) {
            const result: SpanListPage = await runCh(
              repo.listByProjectId({
                organizationId: ORG_ID,
                projectId: PROJECT_ID,
                options: {
                  limit: 1,
                  filters: { operation: [{ op: "eq", value: "equal-order-values" }] },
                  orderBy: { field, direction },
                  ...(cursor ? { cursor } : {}),
                },
              }),
            )
            delivered.push(...result.items.map((span) => span.name))
            cursor = result.nextCursor
          }

          expect(delivered).toEqual(direction === "asc" ? ["tie-1", "tie-2", "tie-3"] : ["tie-3", "tie-2", "tie-1"])
        }
      }
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

    it("pages multiple spans by latest ingested_at, surfacing a re-ingested span at its newest version", async () => {
      // Exercises late materialization end-to-end: the lean keyset picks the page's span_ids
      // (deduped to newest ingested_at, ordered, limited), then the detail re-dedups them.
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ span_id: "aaaaaaaaaaaaaaaa", ingested_at: "2026-01-01 00:10:00.000" }),
          makeSpanRow({ span_id: "bbbbbbbbbbbbbbbb", ingested_at: "2026-01-01 00:20:00.000" }),
          makeSpanRow({ span_id: "cccccccccccccccc", name: "c-old", ingested_at: "2026-01-01 00:15:00.000" }),
          makeSpanRow({ span_id: "cccccccccccccccc", name: "c-new", ingested_at: "2026-01-01 00:30:00.000" }),
          makeSpanRow({ span_id: "dddddddddddddddd", ingested_at: "2026-01-01 00:25:00.000" }),
        ]),
      )

      const page1 = await listWindow(startCursor, 2)
      expect(page1.spans.map((span) => span.spanId)).toEqual(["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"])
      expect(page1.nextCursor).toEqual({
        ingestedAt: new Date("2026-01-01T00:20:00.000Z"),
        spanId: "bbbbbbbbbbbbbbbb",
      })

      // Resume: D (00:25) then C — which sorts last by its *newest* version (00:30), not 00:15.
      const page2 = await listWindow(
        { ingestedAt: new Date("2026-01-01T00:20:00.000Z"), spanId: SpanId("bbbbbbbbbbbbbbbb") },
        2,
      )
      expect(page2.spans.map((span) => span.spanId)).toEqual(["dddddddddddddddd", "cccccccccccccccc"])
      expect(page2.spans.find((span) => span.spanId === "cccccccccccccccc")?.name).toBe("c-new")
      expect(page2.nextCursor).toEqual({
        ingestedAt: new Date("2026-01-01T00:30:00.000Z"),
        spanId: "cccccccccccccccc",
      })

      const page3 = await listWindow(
        { ingestedAt: new Date("2026-01-01T00:30:00.000Z"), spanId: SpanId("cccccccccccccccc") },
        2,
      )
      expect(page3.spans).toHaveLength(0)
      expect(page3.nextCursor).toBeNull()
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

    it("drops the heavy payload columns when excludePayloads is set, keeping the row shape", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "1111111111111111",
            ingested_at: "2026-01-01 00:10:00.000",
            input_messages: '[{"role":"user","content":"hi"}]',
            output_messages: '[{"role":"assistant","content":"yo"}]',
            tool_definitions: '[{"name":"t","description":"d","parameters":{}}]',
            tool_input: "the-input",
            tool_output: "the-output",
          }),
        ]),
      )

      const kept = await listWindow(startCursor, 10)
      expect(kept.spans[0]?.inputMessages).toHaveLength(1)
      expect(kept.spans[0]?.toolInput).toBe("the-input")

      const stripped = await runCh(
        repo.listByIngestedAtWindow({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          cursor: startCursor,
          windowEnd: WINDOW_END,
          limit: 10,
          excludePayloads: true,
        }),
      )

      expect(stripped.spans.map((span) => span.spanId)).toEqual(["1111111111111111"])
      expect(stripped.spans[0]?.inputMessages).toEqual([])
      expect(stripped.spans[0]?.outputMessages).toEqual([])
      expect(stripped.spans[0]?.toolDefinitions).toEqual([])
      expect(stripped.spans[0]?.toolInput).toBe("")
      expect(stripped.spans[0]?.toolOutput).toBe("")
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

    it("keeps identical span ids from different traces while deduping re-ingestion within each trace", async () => {
      const sharedSpanId = "abababababababab"
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: sharedSpanId,
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"trace-a-older"}]}]',
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:01.000000000",
            ingested_at: "2026-03-01 00:00:00.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: sharedSpanId,
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"trace-a-newer"}]}]',
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:01.000000000",
            ingested_at: "2026-03-01 00:00:01.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_B,
            span_id: sharedSpanId,
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"trace-b"}]}]',
            start_time: "2026-03-01 00:00:02.000000000",
            end_time: "2026-03-01 00:00:03.000000000",
            ingested_at: "2026-03-01 00:00:02.000",
          }),
        ]),
      )

      const spans = await runCh(
        repo.findMessagesForSession({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          sessionId: SESSION_ID,
          startTimeFrom: new Date("2026-03-01T00:00:00.000Z"),
          startTimeTo: new Date("2026-03-01T00:10:00.000Z"),
        }),
      )

      expect(spans).toHaveLength(2)
      expect(spans.map((span) => span.outputMessages[0]?.parts?.[0])).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: "trace-a-newer" }),
          expect.objectContaining({ content: "trace-b" }),
        ]),
      )
    })
  })

  describe("findLatestOutputTraceId", () => {
    const TRACE_A = TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    const TRACE_B = TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    const SHARED_SPAN_ID = "sharedspan000001"

    it("returns the trace with the latest output end_time across traces, deduping by (trace_id, span_id)", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            trace_id: TRACE_A,
            span_id: SHARED_SPAN_ID,
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"a"}]}]',
            start_time: "2026-03-02 00:00:00.000000000",
            end_time: "2026-03-02 00:00:01.000000000",
            ingested_at: "2026-03-02 00:00:02.000",
          }),
          makeSpanRow({
            trace_id: TRACE_B,
            span_id: SHARED_SPAN_ID,
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"b"}]}]',
            start_time: "2026-03-02 00:00:02.000000000",
            end_time: "2026-03-02 00:00:03.000000000",
            ingested_at: "2026-03-02 00:00:00.000",
          }),
        ]),
      )

      const latestTraceId = await runCh(
        repo.findLatestOutputTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [TRACE_A, TRACE_B],
        }),
      )

      expect(latestTraceId).toBe(TRACE_B)
    })

    it("returns null when no trace ids are provided", async () => {
      const latestTraceId = await runCh(
        repo.findLatestOutputTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [],
        }),
      )

      expect(latestTraceId).toBeNull()
    })

    it("skips a later trace whose output sits on an operation the conversation view cannot render", async () => {
      const WRAPPER_TRACE = TraceId("cccccccccccccccccccccccccccccccc")
      const CHAT_TRACE = TraceId("dddddddddddddddddddddddddddddddd")

      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            trace_id: CHAT_TRACE,
            span_id: "chatspan00000001",
            operation: "chat",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"real answer"}]}]',
            start_time: "2026-03-03 00:00:00.000000000",
            end_time: "2026-03-03 00:00:01.000000000",
            ingested_at: "2026-03-03 00:00:02.000",
          }),
          makeSpanRow({
            trace_id: WRAPPER_TRACE,
            span_id: "wrapspan00000001",
            operation: "invoke_agent",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"wrapper echo"}]}]',
            start_time: "2026-03-03 00:00:02.000000000",
            end_time: "2026-03-03 00:00:03.000000000",
            ingested_at: "2026-03-03 00:00:04.000",
          }),
        ]),
      )

      const latestTraceId = await runCh(
        repo.findLatestOutputTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [CHAT_TRACE, WRAPPER_TRACE],
        }),
      )

      expect(latestTraceId).toBe(CHAT_TRACE)
    })

    it("returns null when no candidate trace carries output on a message operation", async () => {
      const UNSPECIFIED_TRACE = TraceId("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")

      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            trace_id: UNSPECIFIED_TRACE,
            span_id: "unspecspan000001",
            operation: "unspecified",
            output_messages: '[{"role":"assistant","parts":[{"type":"text","content":"unrenderable"}]}]',
            start_time: "2026-03-04 00:00:00.000000000",
            end_time: "2026-03-04 00:00:01.000000000",
            ingested_at: "2026-03-04 00:00:02.000",
          }),
        ]),
      )

      const latestTraceId = await runCh(
        repo.findLatestOutputTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [UNSPECIFIED_TRACE],
        }),
      )

      expect(latestTraceId).toBeNull()
    })
  })

  describe("listToolSpansBySessionId", () => {
    const SESSION_ID = SessionId("tool-session")
    const TRACE_A = TraceId("11111111111111111111111111111111")
    const TRACE_B = TraceId("22222222222222222222222222222222")
    const ORPHAN_TRACE = TraceId("33333333333333333333333333333333")

    const insertToolFixture = () =>
      runCh(
        insertJsonEachRow(ch.client, "spans", [
          // trace A: the same tool span re-ingested — newest ingested_at (output "NEW") must win
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: "aaaa111111111111",
            operation: "execute_tool",
            tool_name: "search",
            tool_input: '{"q":"x"}',
            tool_output: "OLD",
            status_code: 1,
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:00.500000000",
            ingested_at: "2026-03-01 00:00:00.000",
          }),
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: "aaaa111111111111",
            operation: "execute_tool",
            tool_name: "search",
            tool_input: '{"q":"x"}',
            tool_output: "NEW",
            status_code: 1,
            start_time: "2026-03-01 00:00:00.000000000",
            end_time: "2026-03-01 00:00:00.500000000",
            ingested_at: "2026-03-01 00:00:01.000",
          }),
          // trace A: a non-tool span — excluded (operation != execute_tool)
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_A,
            span_id: "aaaa222222222222",
            operation: "chat",
            start_time: "2026-03-01 00:00:02.000000000",
            end_time: "2026-03-01 00:00:03.000000000",
            ingested_at: "2026-03-01 00:00:02.000",
          }),
          // trace B: a failing tool span (status error)
          makeSpanRow({
            session_id: SESSION_ID,
            trace_id: TRACE_B,
            span_id: "bbbb111111111111",
            operation: "execute_tool",
            tool_name: "delete",
            tool_input: "{}",
            tool_output: "boom",
            status_code: 2,
            error_type: "ToolError",
            start_time: "2026-03-01 00:01:00.000000000",
            end_time: "2026-03-01 00:01:00.100000000",
            ingested_at: "2026-03-01 00:01:00.000",
          }),
          // tool span in a different session — excluded
          makeSpanRow({
            session_id: "session-other",
            trace_id: TraceId("44444444444444444444444444444444"),
            span_id: "cccc111111111111",
            operation: "execute_tool",
            tool_name: "leak",
            start_time: "2026-03-01 00:02:00.000000000",
            end_time: "2026-03-01 00:02:01.000000000",
            ingested_at: "2026-03-01 00:02:00.000",
          }),
          // orphan single-trace session (empty session_id), keyed by trace id
          makeSpanRow({
            session_id: "",
            trace_id: ORPHAN_TRACE,
            span_id: "dddd111111111111",
            operation: "execute_tool",
            tool_name: "orphan_tool",
            start_time: "2026-03-01 00:03:00.000000000",
            end_time: "2026-03-01 00:03:00.250000000",
            ingested_at: "2026-03-01 00:03:00.000",
          }),
        ]),
      )

    it("returns the session's execute_tool spans, deduped, ordered by start time, with mapped I/O and error", async () => {
      await insertToolFixture()
      const tools = await runCh(
        repo.listToolSpansBySessionId({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId: SESSION_ID }),
      )

      expect(tools.map((t) => t.name)).toEqual(["search", "delete"])
      expect(tools[0]).toMatchObject({
        traceId: TRACE_A,
        name: "search",
        input: '{"q":"x"}',
        output: "NEW",
        error: false,
      })
      expect(tools[0]?.durationNs).toBeGreaterThan(0)
      expect(tools[1]).toMatchObject({ traceId: TRACE_B, name: "delete", error: true })
    })

    it("matches orphan single-trace sessions keyed by trace id", async () => {
      await insertToolFixture()
      const tools = await runCh(
        repo.listToolSpansBySessionId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          sessionId: SessionId(ORPHAN_TRACE as string),
        }),
      )

      expect(tools.map((t) => t.name)).toEqual(["orphan_tool"])
    })

    it("keeps identical tool span ids from different traces while deduping re-ingestion within each trace", async () => {
      const DEDUP_SESSION = SessionId("tool-dedup-session")
      const traceA = TraceId("55555555555555555555555555555555")
      const traceB = TraceId("66666666666666666666666666666666")
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            session_id: DEDUP_SESSION,
            trace_id: traceA,
            span_id: "eeee111111111111",
            operation: "execute_tool",
            tool_name: "shared_older",
            start_time: "2026-03-01 00:04:00.000000000",
            end_time: "2026-03-01 00:04:00.100000000",
            ingested_at: "2026-03-01 00:04:00.000",
          }),
          makeSpanRow({
            session_id: DEDUP_SESSION,
            trace_id: traceA,
            span_id: "eeee111111111111",
            operation: "execute_tool",
            tool_name: "shared_newer",
            start_time: "2026-03-01 00:04:00.000000000",
            end_time: "2026-03-01 00:04:00.100000000",
            ingested_at: "2026-03-01 00:04:01.000",
          }),
          makeSpanRow({
            session_id: DEDUP_SESSION,
            trace_id: traceB,
            span_id: "eeee111111111111",
            operation: "execute_tool",
            tool_name: "trace_b_tool",
            start_time: "2026-03-01 00:05:00.000000000",
            end_time: "2026-03-01 00:05:00.100000000",
            ingested_at: "2026-03-01 00:05:00.000",
          }),
        ]),
      )

      const tools = await runCh(
        repo.listToolSpansBySessionId({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId: DEDUP_SESSION }),
      )

      expect(tools.map((t) => t.name)).toEqual(["shared_newer", "trace_b_tool"])
      expect(tools.map((t) => t.traceId)).toEqual([traceA, traceB])
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

  /**
   * The read the redaction preview samples from, and it had no coverage. Ordering and the dedupe
   * are the parts that matter: a preview built on the oldest spans, or on superseded copies of
   * them, would answer a question nobody asked.
   */
  describe("listRecentDetailsByProjectId", () => {
    it("returns the newest deduped spans for the project, with their content payloads", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({
            span_id: "1111111111111111",
            name: "oldest",
            ingested_at: "2026-01-01 00:00:00.000",
            tool_output: "mail old@example.com",
          }),
          makeSpanRow({
            span_id: "2222222222222222",
            name: "newest",
            ingested_at: "2026-01-01 00:00:05.000",
            attr_string: { "acme.note": "ref ACME-1234" },
          }),
          makeSpanRow({
            span_id: "2222222222222222",
            name: "superseded",
            ingested_at: "2026-01-01 00:00:02.000",
          }),
          makeSpanRow({ span_id: "3333333333333333", project_id: OTHER_PROJECT_ID, name: "other-project" }),
        ]),
      )

      const spans = await runCh(
        repo.listRecentDetailsByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, limit: 10 }),
      )

      expect(spans.map((span) => span.name)).toEqual(["newest", "oldest"])
      expect(spans[0]?.attrString["acme.note"]).toBe("ref ACME-1234")
      expect(spans[1]?.toolOutput).toBe("mail old@example.com")
    })

    it("honours the limit, newest first", async () => {
      await runCh(
        insertJsonEachRow(
          ch.client,
          "spans",
          Array.from({ length: 5 }, (_, index) =>
            makeSpanRow({
              span_id: String(index).repeat(16),
              name: `span-${index}`,
              ingested_at: `2026-01-01 00:00:0${index}.000`,
            }),
          ),
        ),
      )

      const spans = await runCh(
        repo.listRecentDetailsByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, limit: 2 }),
      )

      expect(spans.map((span) => span.name)).toEqual(["span-4", "span-3"])
    })
  })
})
