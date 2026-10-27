import { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { TracePurgeRepository, type TracePurgeRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { scopeSessionsMvToRebuild, TracePurgeRepositoryLive } from "./trace-purge-repository.ts"

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

  it("resolves every session key of the traces, including the trace ids that key sessionless spans", async () => {
    const sessionIds = await run((repo) =>
      repo.listSessionIdsByTraceIds({ ...scope, traceIds: [PURGED_IN_SESSION, PURGED_SESSIONLESS] }),
    )

    expect([...sessionIds].sort()).toEqual([PURGED_IN_SESSION, PURGED_SESSIONLESS, SHARED_SESSION].sort())
  })

  it("still resolves a trace's session from the trace rollup once its spans are gone", async () => {
    await ch.client.command({ query: `DELETE FROM spans WHERE ${traceScoped(PURGED_IN_SESSION)}` })

    const sessionIds = await run((repo) => repo.listSessionIdsByTraceIds({ ...scope, traceIds: [PURGED_IN_SESSION] }))

    expect(sessionIds).toContain(SHARED_SESSION)
  })

  it("counts the rows of the selected traces without deleting them", async () => {
    const counts = await run((repo) =>
      repo.countTraceRows({ ...scope, traceIds: [PURGED_IN_SESSION, PURGED_SESSIONLESS] }),
    )

    expect(counts).toMatchObject({
      spans: 3,
      traces: 2,
      trace_search_documents: 2,
      trace_message_occurrences: 1,
      scores: 1,
    })
    expect(await count("spans", traceScoped(PURGED_IN_SESSION))).toBe(2)
  })

  it("purges only the selected traces of the organization, and a repeat purge is a no-op", async () => {
    const traceIds = [PURGED_IN_SESSION, PURGED_SESSIONLESS]
    await run((repo) => repo.purgeTraces({ ...scope, traceIds }))
    await run((repo) => repo.purgeTraces({ ...scope, traceIds }))

    const remaining = await run((repo) => repo.countTraceRows({ ...scope, traceIds }))
    expect(Object.values(remaining).every((rows) => rows === 0)).toBe(true)
    expect(await count("spans", traceScoped(KEPT_IN_SESSION))).toBe(1)
    expect(await count("trace_search_documents", traceScoped(KEPT_ELSEWHERE))).toBe(1)
    expect(await count("scores", traceScoped(KEPT_IN_SESSION))).toBe(1)
    expect(await count("spans", traceScoped(PURGED_IN_SESSION, otherOrganizationId))).toBe(1)
  })

  it("sweeps content only the purged traces referenced, and keeps content a surviving trace still uses", async () => {
    const occurrence = (traceId: string, contentHash: string, messageIndex: number) => ({
      organization_id: organizationId,
      project_id: projectId,
      trace_id: traceId,
      message_index: messageIndex,
      content_hash: contentHash,
      session_id: "",
      start_time: at(0),
      role: "user",
      is_output: 0,
    })
    await insert("trace_message_occurrences", [
      occurrence(PURGED_SESSIONLESS, "only-purged", 0),
      occurrence(PURGED_SESSIONLESS, "shared", 1),
      occurrence(KEPT_ELSEWHERE, "shared", 0),
    ])
    await insert(
      "message_embeddings",
      ["only-purged", "shared"].map((contentHash) => ({
        organization_id: organizationId,
        project_id: projectId,
        content_hash: contentHash,
        embedding: [0.1],
        embedding_model: "m",
      })),
    )
    const memoryEvent = (traceId: string, contentHash: string) => ({
      organization_id: organizationId,
      project_id: projectId,
      store_id: "store",
      record_id: contentHash,
      operation: "write",
      change_kind: "created",
      content_hash: contentHash,
      span_id: "f".repeat(16),
      trace_id: traceId,
      start_time: at(0),
      end_time: at(1),
    })
    await insert("memory_events", [
      memoryEvent(PURGED_SESSIONLESS, "memory-only-purged"),
      memoryEvent(PURGED_SESSIONLESS, "memory-shared"),
      memoryEvent(KEPT_ELSEWHERE, "memory-shared"),
    ])
    await insert(
      "memory_blobs",
      ["memory-only-purged", "memory-shared"].map((contentHash) => ({
        organization_id: organizationId,
        content_hash: contentHash,
        content: "remembered",
      })),
    )

    const counts = await run((repo) => repo.countTraceRows({ ...scope, traceIds: [PURGED_SESSIONLESS] }))
    expect(counts).toMatchObject({ message_embeddings: 1, memory_blobs: 1 })

    await run((repo) => repo.purgeTraces({ ...scope, traceIds: [PURGED_SESSIONLESS] }))

    expect(
      await count("message_embeddings", `organization_id = '${organizationId}' AND content_hash = 'only-purged'`),
    ).toBe(0)
    expect(await count("message_embeddings", `organization_id = '${organizationId}' AND content_hash = 'shared'`)).toBe(
      1,
    )
    expect(
      await count("memory_blobs", `organization_id = '${organizationId}' AND content_hash = 'memory-only-purged'`),
    ).toBe(0)
    expect(
      await count("memory_blobs", `organization_id = '${organizationId}' AND content_hash = 'memory-shared'`),
    ).toBe(1)
  })

  it("deletes every version of the dataset rows copied from the traces only when asked to", async () => {
    const datasetRow = (rowId: string, traceId: string, xactId: number) => ({
      organization_id: organizationId,
      dataset_id: "dataset-1",
      row_id: rowId,
      xact_id: xactId,
      input: "copied prompt",
      metadata: JSON.stringify({ traceId }),
    })
    await insert("dataset_rows", [
      datasetRow("row-copied", PURGED_SESSIONLESS, 1),
      datasetRow("row-copied", PURGED_SESSIONLESS, 2),
      datasetRow("row-kept", KEPT_ELSEWHERE, 1),
    ])
    const traceIds = [PURGED_SESSIONLESS]

    expect(await run((repo) => repo.countTraceRows({ ...scope, traceIds }))).not.toHaveProperty("dataset_rows")
    await run((repo) => repo.purgeTraces({ ...scope, traceIds }))
    expect(await count("dataset_rows", `organization_id = '${organizationId}' AND row_id = 'row-copied'`)).toBe(2)

    expect(await run((repo) => repo.countTraceRows({ ...scope, traceIds, includeDatasetRows: true }))).toMatchObject({
      dataset_rows: 2,
    })
    await run((repo) => repo.purgeTraces({ ...scope, traceIds, includeDatasetRows: true }))
    expect(await count("dataset_rows", `organization_id = '${organizationId}' AND row_id = 'row-copied'`)).toBe(0)
    expect(await count("dataset_rows", `organization_id = '${organizationId}' AND row_id = 'row-kept'`)).toBe(1)
  })

  it("drops session-scoped data and rebuilds sessions from their surviving spans", async () => {
    const traceIds = [PURGED_IN_SESSION, PURGED_SESSIONLESS]
    const sessionIds = await run((repo) => repo.listSessionIdsByTraceIds({ ...scope, traceIds }))
    await run((repo) => repo.purgeTraces({ ...scope, traceIds }))

    const counted = await run((repo) => repo.countSessionRows({ ...scope, sessionIds }))
    const result = await run((repo) => repo.purgeSessions({ ...scope, sessionIds }))

    expect(counted).toMatchObject({ session_analyses: 1, scores: 1 })
    expect(result.rebuiltSessions).toBe(1)
    expect(await readSession(SHARED_SESSION)).toEqual({ traces: 1, spans: 1, tokens: 7 })
    expect(await readSession(PURGED_SESSIONLESS)).toBeNull()
    expect(await readSession(UNTOUCHED_SESSION)).toEqual({ traces: 1, spans: 1, tokens: 5 })
    expect(await readSession(SHARED_SESSION, otherOrganizationId)).toEqual({ traces: 1, spans: 1, tokens: 99 })
    expect(await count("session_analyses", `session_id = '${UNTOUCHED_SESSION}'`)).toBe(1)
    expect(await count("scores", `trace_id = '' AND session_id = '${UNTOUCHED_SESSION}'`)).toBe(1)
    expect(await count("scores", traceScoped(KEPT_IN_SESSION))).toBe(1)
  })

  it("keeps a surviving sessionless trace that shares its rollup key with a purged session", async () => {
    const sharedKey = TraceId("5".repeat(32))
    const purgedInKeyedSession = TraceId("6".repeat(32))
    await insert("spans", [
      span({ traceId: purgedInKeyedSession, spanId: "f1", sessionId: sharedKey, minute: 20, tokensInput: 11 }),
      span({ traceId: sharedKey, spanId: "g1", minute: 21, tokensInput: 13 }),
    ])

    const sessionIds = await run((repo) =>
      repo.listSessionIdsByTraceIds({ ...scope, traceIds: [purgedInKeyedSession] }),
    )
    await run((repo) => repo.purgeTraces({ ...scope, traceIds: [purgedInKeyedSession] }))
    const result = await run((repo) => repo.purgeSessions({ ...scope, sessionIds }))

    expect(sessionIds).toContain(sharedKey)
    expect(result.rebuiltSessions).toBe(1)
    expect(await readSession(sharedKey)).toEqual({ traces: 1, spans: 1, tokens: 13 })
  })

  it("is a no-op when nothing matches", async () => {
    await run((repo) => repo.purgeTraces({ ...scope, traceIds: [TraceId("9".repeat(32))] }))
    const sessions = await run((repo) => repo.purgeSessions({ ...scope, sessionIds: [SessionId("missing")] }))

    expect(sessions.rebuiltSessions).toBe(0)
    expect(await count("spans", "1")).toBe(6)
  })
})

describe("scopeSessionsMvToRebuild", () => {
  const select = "SELECT s.organization_id, count() AS span_count FROM default.spans AS s GROUP BY s.organization_id"

  it("scopes the view's aggregation to the requested sessions before its GROUP BY", () => {
    const statement = scopeSessionsMvToRebuild(select, ["organization_id", "span_count"])

    expect(statement).toMatch(/^INSERT INTO sessions \(`organization_id`, `span_count`\) SELECT /)
    expect(statement).toMatch(
      /FROM default\.spans AS s WHERE s\.organization_id = \{organizationId:String\}[\s\S]*coalesce\(nullIf\(s\.session_id, ''\), toString\(s\.trace_id\)\) IN \{sessionIds:Array\(String\)\}\s+GROUP BY s\.organization_id$/,
    )
  })

  it("refuses a view whose shape it cannot scope", () => {
    expect(() => scopeSessionsMvToRebuild("SELECT 1 FROM spans GROUP BY 1", ["a"])).toThrow(/sessions_mv/)
    expect(() => scopeSessionsMvToRebuild(`${select} UNION ALL ${select}`, ["a"])).toThrow(/sessions_mv/)
    expect(() => scopeSessionsMvToRebuild(select, [])).toThrow(/sessions_mv/)
  })
})
