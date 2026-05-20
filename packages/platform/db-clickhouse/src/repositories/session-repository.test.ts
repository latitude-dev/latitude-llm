import { type ChSqlClient, isNotFoundError, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { SessionRepository, type SessionRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { SessionRepositoryLive } from "./session-repository.ts"

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

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

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
      const session = page.items[0]!
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
      const session = page.items[0]!
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
      const session = page.items[0]!
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

      const session = (
        await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }))
      ).items[0]!

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

      const session = (
        await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }))
      ).items[0]!

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

      const session = (
        await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }))
      ).items[0]!

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

      const session = (
        await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }))
      ).items[0]!

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

      const session = (
        await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }))
      ).items[0]!

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

      const session = (
        await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options: { limit: 10 } }))
      ).items[0]!

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
      const realSession = page.items.find((s) => s.sessionId === sessionId)!
      const orphan = page.items.find((s) => s.sessionId === traceId)!

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
})
