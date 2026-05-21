import { AI, AIError, type AIShape } from "@domain/ai"
import { type ChSqlClient, isNotFoundError, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { SessionRepository, type SessionRepositoryShape, TRACE_SEARCH_EMBEDDING_DIMENSIONS } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { SessionRepositoryLive } from "./session-repository.ts"

/**
 * Mock AI layer used by the search tests. The session-repo search path consults
 * `Effect.serviceOption(AI)` for query-side embeddings; providing this mock
 * exercises the semantic branch with a deterministic [0.1, 0.1, ...] vector so
 * cosine similarity against aligned vs anti-parallel embeddings is predictable.
 */
const mockAILayer = Layer.succeed(AI, {
  generate: () => Effect.fail(new AIError({ message: "Generate not implemented in mock" })),
  embed: () => Effect.succeed({ embedding: new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1) }),
  rerank: () => Effect.fail(new AIError({ message: "Rerank not implemented in mock" })),
} as AIShape)

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")

const toClickHouseDateTime = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "")

interface SpanOverrides {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly sessionId?: string
  readonly startTime: Date
  readonly durationMs?: number
  readonly name?: string
  readonly model?: string
  readonly provider?: string
  readonly timeToFirstTokenNs?: number
  readonly tokensInput?: number
  readonly tokensOutput?: number
  readonly costTotalMicrocents?: number
  readonly inputMessages?: string
  readonly outputMessages?: string
  readonly systemInstructions?: string
}

const makeSpanRow = (overrides: SpanOverrides): SpanRow => {
  const durationMs = overrides.durationMs ?? 1_000
  const startTime = overrides.startTime
  const endTime = new Date(startTime.getTime() + durationMs)

  return {
    organization_id: ORG_ID as string,
    project_id: PROJECT_ID as string,
    session_id: overrides.sessionId ?? "",
    user_id: "",
    trace_id: overrides.traceId,
    span_id: overrides.spanId,
    parent_span_id: overrides.parentSpanId ?? "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toClickHouseDateTime(startTime),
    end_time: toClickHouseDateTime(endTime),
    name: overrides.name ?? "test-span",
    service_name: "test-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: "",
    provider: overrides.provider ?? "",
    model: overrides.model ?? "",
    response_model: "",
    tokens_input: overrides.tokensInput ?? 0,
    tokens_output: overrides.tokensOutput ?? 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: overrides.costTotalMicrocents ?? 0,
    cost_total_microcents: overrides.costTotalMicrocents ?? 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: overrides.timeToFirstTokenNs ?? 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: overrides.inputMessages ?? "",
    output_messages: overrides.outputMessages ?? "",
    system_instructions: overrides.systemInstructions ?? "",
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
  }
}

const ch = setupTestClickHouse()

// chdb materialized views run synchronously per insert; one batched insert per
// scenario is enough to populate sessions for these tests.
const insertSpans = (rows: SpanRow[]) => ch.client.insert({ table: "spans", values: rows, format: "JSONEachRow" })

/**
 * Throw-on-null helper. Tests are full of "I just inserted this fixture,
 * the array index has to exist" reasoning that the type system can't see;
 * `nonNull(x)` keeps the assertion explicit (and biome-friendly) without
 * peppering `!` everywhere.
 */
function nonNull<T>(value: T | null | undefined, message = "Expected value to be defined"): T {
  if (value == null) throw new Error(message)
  return value
}

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient | AI>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(mockAILayer, ChSqlClientLive(ch.client, ORG_ID)))))

describe("SessionRepository", () => {
  let repo: SessionRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* SessionRepository
      }).pipe(withClickHouse(SessionRepositoryLive, ch.client, ORG_ID)),
    )
  })

  describe("orphan-trace-as-session", () => {
    it("synthesizes a 1-trace session for spans without gen_ai.conversation.id", async () => {
      const traceId = "a".repeat(32)
      const startTime = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      await insertSpans([
        makeSpanRow({
          traceId,
          spanId: "1".repeat(16),
          startTime,
          name: "orphan-root",
        }),
        makeSpanRow({
          traceId,
          spanId: "2".repeat(16),
          parentSpanId: "1".repeat(16),
          startTime: new Date(startTime.getTime() + 100),
          name: "child",
        }),
      ])

      const page = await runCh(
        repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }),
      )

      expect(page.items).toHaveLength(1)
      const session = nonNull(page.items[0])
      expect(session.sessionId).toBe(traceId)
      expect(session.traceCount).toBe(1)
      expect(session.traceIds).toEqual([traceId])
      expect(session.spanCount).toBe(2)
      expect(session.rootSpanName).toBe("orphan-root")
    })

    it("aggregates multi-trace conversational sessions with non-empty models", async () => {
      const sessionId = "conv-xyz"
      const traceA = "b".repeat(32)
      const traceB = "c".repeat(32)
      const startA = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      const startB = new Date(Date.UTC(2026, 0, 1, 10, 5, 0))

      await insertSpans([
        makeSpanRow({
          traceId: traceA,
          spanId: "a".repeat(16),
          sessionId,
          startTime: startA,
          model: "gpt-4",
          provider: "openai",
          name: "turn-1-root",
        }),
        makeSpanRow({
          traceId: traceB,
          spanId: "b".repeat(16),
          sessionId,
          startTime: startB,
          model: "gpt-4",
          provider: "openai",
          name: "turn-2-root",
        }),
      ])

      const page = await runCh(
        repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }),
      )

      expect(page.items).toHaveLength(1)
      const session = nonNull(page.items[0])
      expect(session.sessionId).toBe(sessionId)
      expect(session.traceCount).toBe(2)
      expect([...session.traceIds].sort()).toEqual([traceA, traceB].sort())
      expect(session.models).toEqual(["gpt-4"])
      expect(session.providers).toEqual(["openai"])
      // Root span name is the earliest root across the session's traces (turn-1).
      expect(session.rootSpanName).toBe("turn-1-root")
    })
  })

  describe("active-execution duration_ns", () => {
    it("sums root-span durations across concurrent traces independently of wall-clock", async () => {
      const sessionId = "concurrent-session"
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      // Two traces running in parallel: each root is 5s long, but they overlap.
      // Wall-clock window = 5s. Active execution = 10s (sum of both roots).
      await insertSpans([
        makeSpanRow({
          traceId: "1".repeat(32),
          spanId: "1".repeat(16),
          sessionId,
          startTime: start,
          durationMs: 5_000,
          name: "trace-1-root",
        }),
        makeSpanRow({
          traceId: "2".repeat(32),
          spanId: "2".repeat(16),
          sessionId,
          startTime: start,
          durationMs: 5_000,
          name: "trace-2-root",
        }),
      ])

      const page = await runCh(
        repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }),
      )

      expect(page.items).toHaveLength(1)
      const session = nonNull(page.items[0])
      const wallClockNs = session.endTime.getTime() * 1_000_000 - session.startTime.getTime() * 1_000_000
      // Active execution sums both roots: 10s in nanoseconds (10_000_000_000).
      expect(session.durationNs).toBe(10_000_000_000)
      // Wall-clock window is only 5s — diverges from active execution.
      expect(session.durationNs).toBeGreaterThan(wallClockNs)
    })

    it("sums multiple root spans within a single trace", async () => {
      const sessionId = "multi-root-session"
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      // Same trace, two root (parent_span_id = '') spans — both count toward duration_ns.
      await insertSpans([
        makeSpanRow({
          traceId: "3".repeat(32),
          spanId: "1".repeat(16),
          sessionId,
          startTime: start,
          durationMs: 3_000,
          name: "root-a",
        }),
        makeSpanRow({
          traceId: "3".repeat(32),
          spanId: "2".repeat(16),
          sessionId,
          startTime: new Date(start.getTime() + 1_000),
          durationMs: 3_000,
          name: "root-b",
        }),
      ])

      const session = nonNull(
        (await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } })))
          .items[0],
      )

      // Two roots × 3s each = 6_000_000_000 ns. Children are absent so no double counting.
      expect(session.durationNs).toBe(6_000_000_000)
    })
  })

  describe("time_to_first_token_ns sentinel", () => {
    it("reads 0 when no span produced a first token", async () => {
      const sessionId = "no-ttft"
      await insertSpans([
        makeSpanRow({
          traceId: "4".repeat(32),
          spanId: "1".repeat(16),
          sessionId,
          startTime: new Date(Date.UTC(2026, 0, 1, 10, 0, 0)),
        }),
      ])

      const session = nonNull(
        (await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } })))
          .items[0],
      )

      expect(session.timeToFirstTokenNs).toBe(0)
    })

    it("reads positive when at least one span has a first-token offset", async () => {
      const sessionId = "with-ttft"
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      await insertSpans([
        makeSpanRow({
          traceId: "5".repeat(32),
          spanId: "1".repeat(16),
          sessionId,
          startTime: start,
          // Span starts 100ms after session start, first token 50ms after span start.
          timeToFirstTokenNs: 50_000_000,
        }),
      ])

      const session = nonNull(
        (await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } })))
          .items[0],
      )

      // Session start == span start (only one span), so session-TTFT == span-TTFT.
      expect(session.timeToFirstTokenNs).toBe(50_000_000)
    })

    it("reads 0 for a session whose time_of_first_token is the epoch sentinel (pre-PR1 row)", async () => {
      // Simulate the forward-only migration artifact: a session row whose
      // time_of_first_token was never written (defaults to 1970-01-01 for
      // SimpleAggregateFunction(min, DateTime64) with no DEFAULT). Insert a
      // partial directly into `sessions` to reproduce the shape.
      const sessionId = "stale-pre-pr1"
      const startTime = "2026-01-01 10:00:00.000000000"
      await ch.client.insert({
        table: "sessions",
        values: [
          {
            organization_id: ORG_ID as string,
            project_id: PROJECT_ID as string,
            session_id: sessionId,
            min_start_time: startTime,
            max_end_time: startTime,
            duration_ns: 0,
            // Omitted columns (including time_of_first_token) default to their
            // SimpleAggregateFunction zero. For DateTime64 that is 1970-01-01.
          },
        ],
        format: "JSONEachRow",
      })

      const session = nonNull(
        (await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } })))
          .items[0],
      )

      expect(session.timeToFirstTokenNs).toBe(0)
    })
  })

  describe("last_activity_time", () => {
    it("equals the latest span start_time within the session", async () => {
      const sessionId = "active-session"
      const t0 = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      const t1 = new Date(t0.getTime() + 30_000)
      const t2 = new Date(t0.getTime() + 60_000)

      await insertSpans([
        makeSpanRow({ traceId: "a1".repeat(16), spanId: "1".repeat(16), sessionId, startTime: t0 }),
        makeSpanRow({ traceId: "a1".repeat(16), spanId: "2".repeat(16), sessionId, startTime: t1 }),
        makeSpanRow({ traceId: "a1".repeat(16), spanId: "3".repeat(16), sessionId, startTime: t2 }),
      ])

      const session = nonNull(
        (await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } })))
          .items[0],
      )

      expect(session.lastActivityTime.getTime()).toBe(t2.getTime())
      expect(session.startTime.getTime()).toBe(t0.getTime())
    })

    it("falls back to max_end_time when max_start_time is the migration epoch sentinel", async () => {
      // Pre-migration session row: `max_start_time` was added by 00016 with no
      // DEFAULT, so legacy parts read back as 1970-01-01. Without a fallback
      // the sessions list would show "January 1, 1970" for those rows. Insert
      // a partial directly into `sessions` to reproduce the shape.
      const sessionId = "stale-pre-migration"
      const minStartTime = "2026-01-01 10:00:00.000000000"
      const maxEndTime = "2026-01-01 10:00:05.000000000"
      await ch.client.insert({
        table: "sessions",
        values: [
          {
            organization_id: ORG_ID as string,
            project_id: PROJECT_ID as string,
            session_id: sessionId,
            min_start_time: minStartTime,
            max_end_time: maxEndTime,
            duration_ns: 5_000_000_000,
            // max_start_time omitted on purpose — falls back to the
            // SimpleAggregateFunction(max, DateTime64) zero (1970-01-01).
          },
        ],
        format: "JSONEachRow",
      })

      const session = nonNull(
        (await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } })))
          .items[0],
      )

      expect(session.lastActivityTime.toISOString()).toBe("2026-01-01T10:00:05.000Z")
    })
  })

  describe("mixed binding: real session + orphan fragment", () => {
    it("emits two session rows from one trace_id with tokens_total=0 on the orphan fragment", async () => {
      const traceId = "f".repeat(32)
      const sessionId = "real-conv"
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      await insertSpans([
        // LLM span: tagged with session_id, has tokens + model.
        makeSpanRow({
          traceId,
          spanId: "1".repeat(16),
          sessionId,
          startTime: start,
          name: "llm-call",
          model: "gpt-4",
          tokensInput: 100,
          tokensOutput: 50,
          costTotalMicrocents: 200,
        }),
        // Framework span: same trace_id, no session_id, no tokens.
        makeSpanRow({
          traceId,
          spanId: "2".repeat(16),
          sessionId: "",
          startTime: start,
          name: "http-handler",
        }),
      ])

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { limit: 10, sortBy: "startTime" },
        }),
      )

      expect(page.items).toHaveLength(2)
      const realSession = nonNull(page.items.find((s) => s.sessionId === sessionId))
      const orphan = nonNull(page.items.find((s) => s.sessionId === traceId))

      expect(realSession.models).toEqual(["gpt-4"])
      expect(realSession.tokensTotal).toBeGreaterThan(0)

      // Orphan fragment carries the framework span only.
      expect(orphan.traceCount).toBe(1)
      expect(orphan.traceIds).toEqual([traceId])
      expect(orphan.tokensTotal).toBe(0)
      expect(orphan.costTotalMicrocents).toBe(0)
      expect(orphan.models).toEqual([])
    })
  })

  describe("findBySessionId", () => {
    it("returns SessionDetail with message payloads for an existing session", async () => {
      const sessionId = "detail-session"
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      await insertSpans([
        makeSpanRow({
          traceId: "9".repeat(32),
          spanId: "1".repeat(16),
          sessionId,
          startTime: start,
          name: "opener",
          inputMessages: JSON.stringify([{ role: "user", parts: [{ type: "text", text: "hello" }] }]),
          outputMessages: JSON.stringify([{ role: "assistant", parts: [{ type: "text", text: "hi" }] }]),
          systemInstructions: JSON.stringify([{ type: "text", text: "be helpful" }]),
        }),
      ])

      const detail = await runCh(
        repo.findBySessionId({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId: SessionId(sessionId) }),
      )

      expect(detail.sessionId).toBe(sessionId)
      expect(detail.inputMessages.length).toBeGreaterThan(0)
      expect(detail.outputMessages.length).toBeGreaterThan(0)
      expect(detail.systemInstructions.length).toBeGreaterThan(0)
    })

    it("fails with NotFoundError when the session does not exist", async () => {
      const error = await Effect.runPromise(
        repo
          .findBySessionId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            sessionId: SessionId("missing-session"),
          })
          .pipe(Effect.flip, Effect.provide(ChSqlClientLive(ch.client, ORG_ID))),
      )

      expect(isNotFoundError(error)).toBe(true)
    })
  })

  describe("aggregateMetricsByProjectId", () => {
    it("rolls up time_to_first_token_ns across sessions, ignoring sentinel zeros", async () => {
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      await insertSpans([
        makeSpanRow({
          traceId: "7".repeat(32),
          spanId: "1".repeat(16),
          sessionId: "session-with-ttft",
          startTime: start,
          timeToFirstTokenNs: 30_000_000,
        }),
        makeSpanRow({
          traceId: "8".repeat(32),
          spanId: "1".repeat(16),
          sessionId: "session-without-ttft",
          startTime: start,
          // No first token — session reads sentinel 0.
        }),
      ])

      const metrics = await runCh(repo.aggregateMetricsByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID }))

      // ttft rollup ignores 0-sentinel rows, so min/max/sum only see the 30ms row.
      expect(metrics.timeToFirstTokenNs.min).toBe(30_000_000)
      expect(metrics.timeToFirstTokenNs.max).toBe(30_000_000)
      expect(metrics.timeToFirstTokenNs.sum).toBe(30_000_000)
    })
  })

  describe("search", () => {
    const DIMS = TRACE_SEARCH_EMBEDDING_DIMENSIONS
    const alignedEmbedding = new Array(DIMS).fill(0.1) as readonly number[]
    // A partially-aligned vector: [0.1, 0, 0, ...] gives cosine ~ 1/sqrt(DIMS)
    // relative to the all-0.1 query — small but >= the 0.30 floor only
    // matters in semantic-only mode. We use scaled aligned vectors instead
    // (constants below) so cosine values are predictable across DIMS sizes.
    const buildAlignedAt = (factor: number): readonly number[] => new Array(DIMS).fill(0.1 * factor)

    const padTrace = (prefix: string) => prefix.padEnd(32, "f").slice(0, 32)
    const padSpan = (prefix: string) => prefix.padEnd(16, "f").slice(0, 16)

    interface SearchDoc {
      readonly traceId: string
      readonly text: string
      readonly startTime: Date
      readonly contentHashSuffix: string
    }

    interface SearchEmbedding {
      readonly traceId: string
      readonly chunkIndex: number
      readonly embedding: readonly number[]
      readonly startTime: Date
      readonly contentHashSuffix: string
    }

    const insertSearchDocs = (docs: readonly SearchDoc[]) =>
      Effect.runPromise(
        insertJsonEachRow(
          ch.client,
          "trace_search_documents",
          docs.map((d) => ({
            organization_id: ORG_ID as string,
            project_id: PROJECT_ID as string,
            trace_id: d.traceId,
            start_time: toClickHouseDateTime(d.startTime),
            root_span_name: "root",
            search_text: d.text,
            content_hash: `${"a".repeat(64 - d.contentHashSuffix.length)}${d.contentHashSuffix}`,
            indexed_at: toClickHouseDateTime(d.startTime),
          })),
        ),
      )

    const insertSearchEmbeddings = (rows: readonly SearchEmbedding[]) =>
      Effect.runPromise(
        insertJsonEachRow(
          ch.client,
          "trace_search_embeddings",
          rows.map((r) => ({
            organization_id: ORG_ID as string,
            project_id: PROJECT_ID as string,
            trace_id: r.traceId,
            chunk_index: r.chunkIndex,
            start_time: toClickHouseDateTime(r.startTime),
            content_hash: `${"b".repeat(64 - r.contentHashSuffix.length)}${r.contentHashSuffix}`,
            embedding_model: "voyage-4-large",
            embedding: [...r.embedding],
            indexed_at: toClickHouseDateTime(r.startTime),
          })),
        ),
      )

    // 1) Lexical-only: phrase match across two sessions with two traces each,
    //    no embeddings — every trace scores 0.0. They must still appear,
    //    each session reporting matching_trace_count = 2 (spec §6.4).
    it("lexical-only: sessions with all-zero per-trace scores still surface and count", async () => {
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))
      const sessionA = "lex-session-a"
      const sessionB = "lex-session-b"
      const traceA1 = padTrace("a1")
      const traceA2 = padTrace("a2")
      const traceB1 = padTrace("b1")
      const traceB2 = padTrace("b2")

      await insertSpans([
        makeSpanRow({ traceId: traceA1, spanId: padSpan("a1"), sessionId: sessionA, startTime: start }),
        makeSpanRow({
          traceId: traceA2,
          spanId: padSpan("a2"),
          sessionId: sessionA,
          startTime: new Date(start.getTime() + 1_000),
        }),
        makeSpanRow({
          traceId: traceB1,
          spanId: padSpan("b1"),
          sessionId: sessionB,
          startTime: new Date(start.getTime() + 2_000),
        }),
        makeSpanRow({
          traceId: traceB2,
          spanId: padSpan("b2"),
          sessionId: sessionB,
          startTime: new Date(start.getTime() + 3_000),
        }),
      ])

      await insertSearchDocs([
        { traceId: traceA1, text: "user asked about a refund for order 12", startTime: start, contentHashSuffix: "1" },
        { traceId: traceA2, text: "refund denied; escalate to manager", startTime: start, contentHashSuffix: "2" },
        { traceId: traceB1, text: "refund request for shipping", startTime: start, contentHashSuffix: "3" },
        { traceId: traceB2, text: "approved the refund and notified", startTime: start, contentHashSuffix: "4" },
      ])

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"refund"', limit: 10 },
        }),
      )

      const sessionIds = page.items.map((s) => s.sessionId).sort()
      expect(sessionIds).toEqual([sessionA, sessionB].sort())

      const matches = nonNull(page.searchMatches)
      expect(matches[sessionA]).toBeDefined()
      expect(matches[sessionB]).toBeDefined()
      expect(matches[sessionA]?.bestScore).toBe(0)
      expect(matches[sessionB]?.bestScore).toBe(0)
      expect(matches[sessionA]?.matchingTraceCount).toBe(2)
      expect(matches[sessionB]?.matchingTraceCount).toBe(2)
      expect(matches[sessionA]?.matchingTraceIds).toHaveLength(2)
      expect(matches[sessionA]?.matchingTraceScores).toHaveLength(2)
      expect([...nonNull(matches[sessionA]).matchingTraceIds].sort()).toEqual([traceA1, traceA2].sort())
      expect([...nonNull(matches[sessionB]).matchingTraceIds].sort()).toEqual([traceB1, traceB2].sort())
      // All zero-score lexical matches: scores parallel-aligned and all 0.
      expect(matches[sessionA]?.matchingTraceScores.every((s) => s === 0)).toBe(true)
      expect(matches[sessionB]?.matchingTraceScores.every((s) => s === 0)).toBe(true)
    })

    // 2) Hybrid: a session with three matching traces; two have embeddings
    //    with distinct cosine scores, one has no embedding (relevance_score
    //    falls to 0 via the LEFT JOIN). best_score = max of semantic scores,
    //    matching_trace_count = 3, ids ordered by score DESC.
    it("hybrid: bestScore picks max semantic score; embedding-less matches still count via LEFT JOIN", async () => {
      const start = new Date(Date.UTC(2026, 0, 2, 10, 0, 0))
      const sessionId = "hybrid-session"
      const traceStrong = padTrace("c1") // aligned (cosine ~ 1.0)
      const traceWeak = padTrace("c2") // partially aligned (cosine < 1.0)
      const traceNoEmb = padTrace("c3") // no embedding row

      await insertSpans([
        makeSpanRow({ traceId: traceStrong, spanId: padSpan("c1"), sessionId, startTime: start }),
        makeSpanRow({
          traceId: traceWeak,
          spanId: padSpan("c2"),
          sessionId,
          startTime: new Date(start.getTime() + 1_000),
        }),
        makeSpanRow({
          traceId: traceNoEmb,
          spanId: padSpan("c3"),
          sessionId,
          startTime: new Date(start.getTime() + 2_000),
        }),
      ])

      await insertSearchDocs([
        {
          traceId: traceStrong,
          text: "the payment refund pipeline is broken",
          startTime: start,
          contentHashSuffix: "h1",
        },
        { traceId: traceWeak, text: "payment retried successfully", startTime: start, contentHashSuffix: "h2" },
        { traceId: traceNoEmb, text: "payment receipt issued", startTime: start, contentHashSuffix: "h3" },
      ])

      // Strong: fully aligned — cosine 1.0. Weak: a single non-zero coord —
      // cosine with the [0.1, 0.1, ...] mock query is 1/sqrt(DIMS), well below
      // strong but non-zero. No embedding row for traceNoEmb.
      const weakVec = (() => {
        const v = new Array(DIMS).fill(0) as number[]
        v[0] = 0.1
        return v as readonly number[]
      })()
      await insertSearchEmbeddings([
        { traceId: traceStrong, chunkIndex: 0, embedding: alignedEmbedding, startTime: start, contentHashSuffix: "e1" },
        { traceId: traceWeak, chunkIndex: 0, embedding: weakVec, startTime: start, contentHashSuffix: "e2" },
      ])

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"payment" customer issue', limit: 10 },
        }),
      )

      expect(page.items).toHaveLength(1)
      const match = nonNull(page.searchMatches?.[sessionId])
      expect(match).toBeDefined()
      expect(match.matchingTraceCount).toBe(3)
      // best_score is max(relevance_score). Strong is fully aligned, cosine = 1.0.
      expect(match.bestScore).toBeCloseTo(1.0, 5)
      expect(match.bestTraceId).toBe(traceStrong)
      // ids parallel-aligned with scores DESC. Strong first, weak second, no-emb (0) last.
      expect(match.matchingTraceIds[0]).toBe(traceStrong)
      expect(match.matchingTraceIds[2]).toBe(traceNoEmb)
      expect(match.matchingTraceScores[0]).toBeCloseTo(1.0, 5)
      expect(match.matchingTraceScores[1]).toBeGreaterThan(0)
      expect(match.matchingTraceScores[1]).toBeLessThan(1.0)
      expect(match.matchingTraceScores[2]).toBe(0)
    })

    // 3) Score-filter / telemetry HAVING applied per-trace (spec §6.6).
    //    One session, five matching traces. One has cost > threshold; four
    //    don't. The session must surface with matching_trace_count = 1 (only
    //    the cost-passing trace), not absent and not 5.
    it("telemetry HAVING is applied per-trace inside trace_rollup, not post-rollup", async () => {
      const start = new Date(Date.UTC(2026, 0, 3, 10, 0, 0))
      const sessionId = "having-session"
      const traces = ["d1", "d2", "d3", "d4", "d5"].map(padTrace)

      // Build five traces; only d3 has a cost above the threshold.
      const COSTS = [10, 20, 5_000_000, 30, 40] // microcents per trace
      await insertSpans(
        traces.map((t, i) =>
          makeSpanRow({
            traceId: t,
            spanId: padSpan(`d${i + 1}`),
            sessionId,
            startTime: new Date(start.getTime() + i * 1_000),
            costTotalMicrocents: nonNull(COSTS[i]),
          }),
        ),
      )
      await insertSearchDocs(
        traces.map((t, i) => ({
          traceId: t,
          text: `cost-bearing trace ${i} discussion`,
          startTime: start,
          contentHashSuffix: `h${i}`,
        })),
      )

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: {
            searchQuery: '"cost-bearing"',
            limit: 10,
            // Telemetry filter: cost > 1000. Only d3 passes per-trace.
            filters: { cost: [{ op: "gt", value: 1000 }] },
          },
        }),
      )

      expect(page.items).toHaveLength(1)
      const match = nonNull(page.searchMatches?.[sessionId])
      expect(match.matchingTraceCount).toBe(1)
      expect(match.matchingTraceIds).toEqual([traces[2]])
      expect(match.bestTraceId).toBe(traces[2])
    })

    // 4) Cursor stability: paginate ten matching sessions across one project.
    //    All scores tie at 0.0 (lexical-only), so the secondary order is
    //    session_id DESC — cursors must walk that monotonically without
    //    duplicates and hasMore must flip false on the last page.
    it("cursor pagination is monotonic with no duplicates across pages", async () => {
      const start = new Date(Date.UTC(2026, 0, 4, 10, 0, 0))
      // Build ten sessions, each with one trace. Use deterministic ids so the
      // DESC sort over session_id is easy to reason about.
      const sessions = Array.from({ length: 10 }, (_v, i) => `cur-session-${i.toString().padStart(2, "0")}`)
      const traces = sessions.map((_s, i) => padTrace(`c${i.toString().padStart(2, "0")}`))

      await insertSpans(
        sessions.map((s, i) =>
          makeSpanRow({
            traceId: nonNull(traces[i]),
            spanId: padSpan(`p${i.toString().padStart(2, "0")}`),
            sessionId: s,
            startTime: new Date(start.getTime() + i * 1_000),
          }),
        ),
      )
      await insertSearchDocs(
        traces.map((t, i) => ({
          traceId: t,
          text: `pagination needle ${i}`,
          startTime: start,
          contentHashSuffix: `n${i}`,
        })),
      )

      const baseOptions = { searchQuery: '"pagination"', limit: 3 } as const
      const page1 = await runCh(
        repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: baseOptions }),
      )
      expect(page1.hasMore).toBe(true)
      expect(page1.nextCursor).toBeDefined()
      expect(page1.items).toHaveLength(3)

      const page2 = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { ...baseOptions, cursor: nonNull(page1.nextCursor) },
        }),
      )
      expect(page2.hasMore).toBe(true)
      expect(page2.nextCursor).toBeDefined()

      const page3 = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { ...baseOptions, cursor: nonNull(page2.nextCursor) },
        }),
      )
      const page4 = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { ...baseOptions, cursor: page3.nextCursor ?? nonNull(page2.nextCursor) },
        }),
      )

      const seen = [...page1.items, ...page2.items, ...page3.items, ...page4.items].map((s) => s.sessionId)
      // No duplicates across pages.
      expect(new Set(seen).size).toBe(seen.length)
      // All ten sessions paginated through.
      expect(seen.sort()).toEqual([...sessions].sort())
      // Final page has no further cursor.
      expect(page4.hasMore).toBe(false)

      // Secondary ordering: session_id DESC across the concatenated stream
      // (best_score ties at 0.0 throughout).
      const sessionIdsInOrder = [...page1.items, ...page2.items, ...page3.items, ...page4.items].map((s) => s.sessionId)
      const sortedDesc = [...sessions].sort().reverse()
      expect(sessionIdsInOrder).toEqual(sortedDesc)
    })

    // 5) Orphan-trace-as-session (spec §6.7). A matching trace whose spans
    //    carry no session id surfaces as a 1-trace session keyed by
    //    toString(trace_id). The synthesized Session has empty models /
    //    providers / tags and tokens_total = 0.
    it("orphan trace surfaces as a synthesized 1-trace session keyed by toString(trace_id)", async () => {
      const start = new Date(Date.UTC(2026, 0, 5, 10, 0, 0))
      const orphanTrace = padTrace("e0")
      const realTrace = padTrace("e1")
      const realSession = "real-session-for-orphan-test"

      await insertSpans([
        // Orphan: no session_id on any span.
        makeSpanRow({ traceId: orphanTrace, spanId: padSpan("o1"), startTime: start, name: "orphan-root" }),
        // Real: tagged with a session id.
        makeSpanRow({
          traceId: realTrace,
          spanId: padSpan("r1"),
          sessionId: realSession,
          startTime: new Date(start.getTime() + 1_000),
          name: "real-root",
        }),
      ])
      await insertSearchDocs([
        { traceId: orphanTrace, text: "lonely orphan signal", startTime: start, contentHashSuffix: "o1" },
        { traceId: realTrace, text: "lonely real signal", startTime: start, contentHashSuffix: "r1" },
      ])

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"lonely"', limit: 10 },
        }),
      )

      expect(page.items).toHaveLength(2)
      const orphanItem = page.items.find((s) => s.sessionId === orphanTrace)
      expect(orphanItem).toBeDefined()
      // Orphan synthesis: traceIds is the matching set, models/providers/tags empty,
      // tokens_total = 0 from the spans seeded.
      expect(orphanItem?.traceCount).toBe(1)
      expect(orphanItem?.traceIds).toEqual([orphanTrace])
      expect(orphanItem?.models).toEqual([])
      expect(orphanItem?.providers).toEqual([])
      expect(orphanItem?.tags).toEqual([])
      expect(orphanItem?.tokensTotal).toBe(0)

      const match = nonNull(page.searchMatches?.[orphanTrace])
      expect(match).toBeDefined()
      expect(match.matchingTraceCount).toBe(1)
      expect(match.matchingTraceIds).toEqual([orphanTrace])
      expect(match.bestTraceId).toBe(orphanTrace)
    })

    // 6) Multi-trace session: matching_trace_ids and matching_trace_scores
    //    parallel-aligned and sorted by score DESC across five distinct
    //    embedding magnitudes.
    it("matching_trace_ids and matching_trace_scores are parallel-aligned and sorted by score DESC", async () => {
      const start = new Date(Date.UTC(2026, 0, 6, 10, 0, 0))
      const sessionId = "ordering-session"
      // Five distinct cosine magnitudes by scaling the aligned [0.1, ...]
      // vector. cosine(q, k*q) = 1.0 for k>0 (parallel), regardless of
      // magnitude — so to get distinct cosines we need to mix directions.
      // Build vectors with one negative coord, varying counts, to control
      // cosine deterministically.
      //
      // q = [0.1, 0.1, ..., 0.1] (DIMS). Pick a base aligned vector and
      // flip the first N coords negative — the cosine becomes
      //   (DIMS - 2N) / DIMS
      // (each flipped coord contributes -1 instead of +1 to the dot product
      // numerator; magnitudes stay equal). With DIMS = 2048:
      //   flips=0    → 1.0
      //   flips=313  → ~0.694 (close to 0.71)
      //   flips=460  → ~0.551 (close to 0.55)
      //   flips=676  → ~0.34
      //   flips=839  → ~0.18
      const buildFlipped = (flipped: number): readonly number[] => {
        const v = new Array(DIMS).fill(0.1) as number[]
        for (let i = 0; i < flipped; i++) v[i] = -0.1
        return v as readonly number[]
      }
      const vec92 = buildFlipped(82) // ~ (2048-164)/2048 = 0.92
      const vec71 = buildFlipped(297) // ~ (2048-594)/2048 = 0.71
      const vec55 = buildFlipped(461) // ~ (2048-922)/2048 = 0.55
      const vec34 = buildFlipped(676) // ~ (2048-1352)/2048 = 0.34
      const vec18 = buildFlipped(840) // ~ (2048-1680)/2048 = 0.18

      const traces = ["t1", "t2", "t3", "t4", "t5"].map(padTrace)
      const vectors = [vec92, vec34, vec71, vec18, vec55] // by trace index (input order)

      await insertSpans(
        traces.map((t, i) =>
          makeSpanRow({
            traceId: t,
            spanId: padSpan(`o${i + 1}`),
            sessionId,
            startTime: new Date(start.getTime() + i * 1_000),
          }),
        ),
      )
      await insertSearchDocs(
        traces.map((t, i) => ({
          traceId: t,
          text: `ordering test trace ${i}`,
          startTime: start,
          contentHashSuffix: `t${i}`,
        })),
      )
      await insertSearchEmbeddings(
        traces.map((t, i) => ({
          traceId: t,
          chunkIndex: 0,
          embedding: nonNull(vectors[i]),
          startTime: start,
          contentHashSuffix: `v${i}`,
        })),
      )

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"ordering" relevance prompt', limit: 10 },
        }),
      )

      expect(page.items).toHaveLength(1)
      const match = nonNull(page.searchMatches?.[sessionId])
      // Ids must be in score-DESC order: t1 (0.92), t3 (0.71), t5 (0.55), t2 (0.34), t4 (0.18).
      expect(match.matchingTraceIds).toEqual([traces[0], traces[2], traces[4], traces[1], traces[3]])
      // Scores parallel-aligned: monotonically non-increasing.
      const scores = match.matchingTraceScores
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(nonNull(scores[i]))
      }
      // Spot-check the extremes against the analytic cosine values.
      expect(scores[0]).toBeCloseTo(0.92, 1)
      expect(scores[scores.length - 1]).toBeCloseTo(0.18, 1)
      expect(match.matchingTraceCount).toBe(5)
      expect(match.bestTraceId).toBe(traces[0])
    })

    // 7) List + count consistency. A search returns the same candidate set
    //    via both paths: matchingTraceCount on each item, summed across all
    //    pages, equals matchingTraceCount from countByProjectId; totalCount
    //    equals the number of sessions reachable by full pagination.
    it("list and count share the same candidate set", async () => {
      const start = new Date(Date.UTC(2026, 0, 7, 10, 0, 0))
      // Build N matching sessions and a few non-matching sessions so the
      // total/matching counts are not trivially equal.
      const matching = Array.from({ length: 4 }, (_v, i) => `lc-match-${i}`)
      const nonMatching = ["lc-skip-1", "lc-skip-2"]
      const matchingTracesPerSession = [3, 1, 2, 4] // varying fan-out

      let spanIdx = 0
      const allSpans: SpanRow[] = []
      const docs: SearchDoc[] = []
      matching.forEach((sid, si) => {
        for (let ti = 0; ti < nonNull(matchingTracesPerSession[si]); ti++) {
          const traceId = padTrace(`l${si}${ti}`)
          allSpans.push(
            makeSpanRow({
              traceId,
              spanId: padSpan(`lc${spanIdx++}`),
              sessionId: sid,
              startTime: new Date(start.getTime() + spanIdx * 1_000),
            }),
          )
          docs.push({
            traceId,
            text: `harvest signal ${sid} turn ${ti}`,
            startTime: start,
            contentHashSuffix: `${si}${ti}`,
          })
        }
      })
      nonMatching.forEach((sid, si) => {
        const traceId = padTrace(`n${si}`)
        allSpans.push(
          makeSpanRow({
            traceId,
            spanId: padSpan(`nm${spanIdx++}`),
            sessionId: sid,
            startTime: new Date(start.getTime() + spanIdx * 1_000),
          }),
        )
        docs.push({
          traceId,
          text: `unrelated chatter ${sid}`,
          startTime: start,
          contentHashSuffix: `nm${si}`,
        })
      })
      await insertSpans(allSpans)
      await insertSearchDocs(docs)

      const searchQuery = '"harvest"'
      const count = await runCh(repo.countByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, searchQuery }))

      // Page through all matching sessions with a small limit.
      const collected: { sessionId: string; matchingTraceCount: number }[] = []
      let cursor: { sortValue: string; sessionId: string } | undefined
      for (let i = 0; i < 10; i++) {
        const page = await runCh(
          repo.listByProjectId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            options: { searchQuery, limit: 2, ...(cursor ? { cursor } : {}) },
          }),
        )
        for (const item of page.items) {
          const m = nonNull(page.searchMatches?.[item.sessionId])
          collected.push({ sessionId: item.sessionId, matchingTraceCount: m.matchingTraceCount })
        }
        if (!page.hasMore || !page.nextCursor) break
        cursor = page.nextCursor
      }

      expect(count.totalCount).toBe(matching.length)
      expect(collected).toHaveLength(matching.length)
      const summed = collected.reduce((acc, c) => acc + c.matchingTraceCount, 0)
      expect(summed).toBe(matchingTracesPerSession.reduce((a, b) => a + b, 0))
      expect(count.matchingTraceCount).toBe(summed)
    })

    // 8) Ordering override (spec §4.7): with searchQuery active, items are
    //    ordered by bestScore DESC, sessionId DESC even when the caller asks
    //    for sortBy: "cost" / sortDirection: "desc".
    it("forces best_score / session_id DESC ordering when searchQuery is active, ignoring sortBy", async () => {
      const start = new Date(Date.UTC(2026, 0, 8, 10, 0, 0))
      const sessionLow = "ord-low-score-high-cost"
      const sessionHigh = "ord-high-score-low-cost"
      const traceLow = padTrace("ol")
      const traceHigh = padTrace("oh")

      await insertSpans([
        // Low-score session pays a huge cost — would come first under sortBy=cost DESC.
        makeSpanRow({
          traceId: traceLow,
          spanId: padSpan("ol"),
          sessionId: sessionLow,
          startTime: start,
          costTotalMicrocents: 9_999_999,
        }),
        // High-score session is cheap.
        makeSpanRow({
          traceId: traceHigh,
          spanId: padSpan("oh"),
          sessionId: sessionHigh,
          startTime: new Date(start.getTime() + 1_000),
          costTotalMicrocents: 10,
        }),
      ])
      await insertSearchDocs([
        { traceId: traceLow, text: "ordering check low score", startTime: start, contentHashSuffix: "ol" },
        { traceId: traceHigh, text: "ordering check high score", startTime: start, contentHashSuffix: "oh" },
      ])
      // Only the high-score session gets an aligned embedding.
      await insertSearchEmbeddings([
        { traceId: traceHigh, chunkIndex: 0, embedding: alignedEmbedding, startTime: start, contentHashSuffix: "oh" },
      ])

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: {
            searchQuery: '"ordering" semantic boost',
            sortBy: "cost",
            sortDirection: "desc",
            limit: 10,
          },
        }),
      )

      // Two sessions, but the high-score one must come first despite cost being
      // an order of magnitude lower.
      const ids = page.items.map((s) => s.sessionId)
      expect(ids[0]).toBe(sessionHigh)
      expect(ids[1]).toBe(sessionLow)
      expect(nonNull(page.searchMatches?.[sessionHigh]).bestScore).toBeGreaterThan(
        nonNull(page.searchMatches?.[sessionLow]).bestScore,
      )
    })

    // Reference: spec §4.7 — when searchQuery is active the server forces
    // ORDER BY best_score DESC, session_id DESC regardless of client sortBy.
    // The use of buildAlignedAt is currently unused but kept for fixtures
    // that may want to inject specific cosine magnitudes; tagging via void
    // keeps the import noise minimal without producing an unused-warning.
    void buildAlignedAt
  })
})
