import { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { TracePurgeRepository, type TracePurgeRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { TracePurgeRepositoryLive } from "./trace-purge-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("x".repeat(24))
const projectId = ProjectId("p".repeat(24))
const scope = { organizationId, projectId }

const PURGED_IN_SESSION = TraceId("1".repeat(32))
const KEPT_IN_SESSION = TraceId("2".repeat(32))
const PURGED_SESSIONLESS = TraceId("3".repeat(32))
const KEPT_ELSEWHERE = TraceId("4".repeat(32))
const SHARED_SESSION = SessionId("session-shared")
const UNTOUCHED_SESSION = SessionId("session-untouched")

const ch = setupTestClickHouse()

const run = <A, E>(fn: (repo: TracePurgeRepositoryShape) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* fn(yield* TracePurgeRepository)
    }).pipe(withClickHouse(TracePurgeRepositoryLive, ch.client, organizationId)),
  )

const at = (minute: number) => `2026-10-01 12:${String(minute).padStart(2, "0")}:00.000`

const span = (input: {
  readonly organizationId?: string
  readonly traceId: string
  readonly spanId: string
  readonly sessionId?: string
  readonly minute: number
  readonly tokensInput: number
}) => ({
  organization_id: input.organizationId ?? organizationId,
  project_id: projectId,
  session_id: input.sessionId ?? "",
  trace_id: input.traceId,
  span_id: input.spanId.padEnd(16, "0"),
  start_time: at(input.minute),
  end_time: at(input.minute + 1),
  operation: "chat",
  tokens_input: input.tokensInput,
  input_messages: `message of ${input.traceId}`,
  output_messages: "reply",
})

const insert = (table: string, values: Record<string, unknown>[]) =>
  ch.client.insert({ table, values, format: "JSONEachRow" })

const count = async (table: string, where: string) => {
  const result = await ch.client.query({
    query: `SELECT count() AS c FROM ${table} WHERE ${where}`,
    format: "JSONEachRow",
  })
  const [row] = await result.json<{ c: string }>()
  return Number(row?.c ?? 0)
}

const readSession = async (sessionId: string, org: string = organizationId) => {
  const result = await ch.client.query({
    query: `SELECT uniqExactMerge(trace_count) AS traces, sum(span_count) AS spans, sum(tokens_input) AS tokens
            FROM sessions
            WHERE organization_id = {org:String} AND project_id = {projectId:String} AND session_id = {sessionId:String}
            GROUP BY session_id`,
    query_params: { org, projectId, sessionId },
    format: "JSONEachRow",
  })
  const [row] = await result.json<{ traces: string; spans: string; tokens: string }>()
  return row ? { traces: Number(row.traces), spans: Number(row.spans), tokens: Number(row.tokens) } : null
}

const traceScoped = (traceId: string, org: string = organizationId) =>
  `organization_id = '${org}' AND trace_id = '${traceId}'`

describe("TracePurgeRepository", () => {
  beforeEach(async () => {
    await insert("spans", [
      span({ traceId: PURGED_IN_SESSION, spanId: "a1", sessionId: SHARED_SESSION, minute: 0, tokensInput: 10 }),
      span({ traceId: PURGED_IN_SESSION, spanId: "a2", sessionId: SHARED_SESSION, minute: 1, tokensInput: 20 }),
      span({ traceId: KEPT_IN_SESSION, spanId: "b1", sessionId: SHARED_SESSION, minute: 5, tokensInput: 7 }),
      span({ traceId: PURGED_SESSIONLESS, spanId: "c1", minute: 10, tokensInput: 3 }),
      span({ traceId: KEPT_ELSEWHERE, spanId: "d1", sessionId: UNTOUCHED_SESSION, minute: 15, tokensInput: 5 }),
      span({
        organizationId: otherOrganizationId,
        traceId: PURGED_IN_SESSION,
        spanId: "e1",
        sessionId: SHARED_SESSION,
        minute: 0,
        tokensInput: 99,
      }),
    ])

    await insert(
      "trace_search_documents",
      [PURGED_IN_SESSION, PURGED_SESSIONLESS, KEPT_ELSEWHERE].map((traceId) => ({
        organization_id: organizationId,
        project_id: projectId,
        trace_id: traceId,
        start_time: at(0),
        content_hash: "h".repeat(64),
      })),
    )
    await insert("trace_message_occurrences", [
      {
        organization_id: organizationId,
        project_id: projectId,
        trace_id: PURGED_IN_SESSION,
        message_index: 0,
        content_hash: "h",
        session_id: SHARED_SESSION,
        start_time: at(0),
        role: "user",
        is_output: 0,
      },
    ])
    await insert(
      "session_analyses",
      [SHARED_SESSION, UNTOUCHED_SESSION].map((sessionId) => ({
        organization_id: organizationId,
        project_id: projectId,
        session_id: sessionId,
        start_time: at(0),
        end_time: at(20),
        trace_ids: [],
        analysis_hash: "a".repeat(64),
        analysis_status: "completed",
      })),
    )

    const score = (id: string, traceId: string, sessionId: string) => ({
      id: id.repeat(24),
      organization_id: organizationId,
      project_id: projectId,
      source: "annotation",
      source_id: "s",
      trace_id: traceId,
      session_id: sessionId,
      value: 1,
      passed: true,
      errored: false,
      created_at: at(0),
    })
    await insert("scores", [
      score("a", PURGED_IN_SESSION, SHARED_SESSION),
      score("b", KEPT_IN_SESSION, SHARED_SESSION),
      score("c", "", SHARED_SESSION),
      score("d", "", UNTOUCHED_SESSION),
    ])
  })

  it("resolves effective session ids, falling back to the trace id for sessionless traces", async () => {
    const sessionIds = await run((repo) =>
      repo.listSessionIdsByTraceIds({ ...scope, traceIds: [PURGED_IN_SESSION, PURGED_SESSIONLESS] }),
    )

    expect([...sessionIds].sort()).toEqual([PURGED_SESSIONLESS, SHARED_SESSION].sort())
  })

  it("purges only the selected traces of the organization and reports per-table counts", async () => {
    const counts = await run((repo) =>
      repo.purgeTraces({ ...scope, traceIds: [PURGED_IN_SESSION, PURGED_SESSIONLESS] }),
    )

    expect(counts).toMatchObject({
      spans: 3,
      traces: 2,
      trace_search_documents: 2,
      trace_message_occurrences: 1,
      scores: 1,
    })
    expect(await count("spans", traceScoped(PURGED_IN_SESSION))).toBe(0)
    expect(await count("traces", traceScoped(PURGED_SESSIONLESS))).toBe(0)
    expect(await count("spans", traceScoped(KEPT_IN_SESSION))).toBe(1)
    expect(await count("trace_search_documents", traceScoped(KEPT_ELSEWHERE))).toBe(1)
    expect(await count("scores", traceScoped(KEPT_IN_SESSION))).toBe(1)
    expect(await count("spans", traceScoped(PURGED_IN_SESSION, otherOrganizationId))).toBe(1)
  })

  it("drops session-scoped data and rebuilds sessions from their surviving spans", async () => {
    const sessionIds = await run((repo) =>
      repo.listSessionIdsByTraceIds({ ...scope, traceIds: [PURGED_IN_SESSION, PURGED_SESSIONLESS] }),
    )
    await run((repo) => repo.purgeTraces({ ...scope, traceIds: [PURGED_IN_SESSION, PURGED_SESSIONLESS] }))

    const result = await run((repo) => repo.purgeSessions({ ...scope, sessionIds }))

    expect(result.rebuiltSessions).toBe(1)
    expect(result.deleted).toMatchObject({ session_analyses: 1, scores: 1 })
    expect(await readSession(SHARED_SESSION)).toEqual({ traces: 1, spans: 1, tokens: 7 })
    expect(await readSession(PURGED_SESSIONLESS)).toBeNull()
    expect(await readSession(UNTOUCHED_SESSION)).toEqual({ traces: 1, spans: 1, tokens: 5 })
    expect(await readSession(SHARED_SESSION, otherOrganizationId)).toEqual({ traces: 1, spans: 1, tokens: 99 })
    expect(await count("session_analyses", `session_id = '${UNTOUCHED_SESSION}'`)).toBe(1)
    expect(await count("scores", `trace_id = '' AND session_id = '${UNTOUCHED_SESSION}'`)).toBe(1)
    expect(await count("scores", traceScoped(KEPT_IN_SESSION))).toBe(1)
  })

  it("is a no-op when nothing matches", async () => {
    const counts = await run((repo) => repo.purgeTraces({ ...scope, traceIds: [TraceId("9".repeat(32))] }))
    const sessions = await run((repo) => repo.purgeSessions({ ...scope, sessionIds: [SessionId("missing")] }))

    expect(Object.values(counts).every((rows) => rows === 0)).toBe(true)
    expect(sessions.rebuiltSessions).toBe(0)
    expect(await count("spans", "1")).toBe(6)
  })
})
